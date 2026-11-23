import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarConfigPadrao } from '../../db/config-padrao';
import {
  clientesFidelidade,
  comprovantes,
  config,
  itensCardapio,
  pedidos,
} from '../../db/memory-store';
import { MockEmissorFiscal } from '../../integrations/api-fiscal';
import {
  MockPagamentoGateway,
  type CobrancaPixCriada,
  type CriarCobrancaPixParams,
} from '../../integrations/gateway-pagamento';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { registrarConsentimentos } from '../consentimento/consentimento.service';
import { VERSAO_TERMO } from '../consentimento/termo';
import { informarFidelidade, usarPontos } from '../identificacao/identificacao.service';
import {
  cancelarPix,
  consultarPix,
  escolherFormaPagamento,
  processarNotificacaoPix,
  verificarCobrancasPix,
} from './pagamento.service';

// Gateway que conta as cobranças criadas e os estornos, para provar que o cliente nunca
// é cobrado duas vezes.
class GatewayContado extends MockPagamentoGateway {
  criadas = new Set<string>();
  estornadas: string[] = [];

  async criarCobrancaPix(params: CriarCobrancaPixParams): Promise<CobrancaPixCriada> {
    const cobranca = await super.criarCobrancaPix(params);
    this.criadas.add(cobranca.transacaoId);
    return cobranca;
  }

  async estornar(transacaoId: string): Promise<void> {
    this.estornadas.push(transacaoId);
    await super.estornar(transacaoId);
  }
}

let gateway: GatewayContado;
const emissor = new MockEmissorFiscal();

const pagarPix = (pedidoId: string) =>
  escolherFormaPagamento({ pedidoId, formaPagamento: 'pix', consumo: 'local' }, gateway, emissor);

// O "cliente pagou no app do banco": o mock confirma e dispara o webhook.
const clientePaga = (transacaoId: string) => gateway.pagar(transacaoId);

// Avança o relógio (só Date) para depois do vencimento do QR.
function passarDoPrazo(): void {
  vi.setSystemTime(Date.now() + 301_000);
}

// Um item novo por teste: pedidos de testes anteriores não mexem no estoque dele.
let tortaId = '';
const torta = () => itensCardapio.find((item) => item.id === tortaId);

async function pedidoComTorta(quantidade = 2): Promise<string> {
  const pedidoId = randomUUID();
  await adicionarItem({ pedidoId, item: { itemCardapioId: tortaId, nome: 'x', quantidade } });
  return pedidoId;
}

async function identificar(pedidoId: string, cpf: string, pontos: number): Promise<void> {
  clientesFidelidade.set(cpf, { id: `cliente-${randomUUID()}`, numeroFidelidade: cpf, pontos });
  await registrarConsentimentos({
    pedidoId,
    versaoTermo: VERSAO_TERMO,
    decisoes: { fidelidade: true },
  });
  await informarFidelidade({ pedidoId, numeroFidelidade: cpf });
}

beforeEach(() => {
  process.env.MOCK_PIX_PAGAR_APOS_SEGUNDOS = 'nunca';
  gateway = new GatewayContado();
  gateway.aoNotificar((transacaoId) => processarNotificacaoPix(transacaoId, gateway, emissor));
  vi.useFakeTimers({ toFake: ['Date'] });
  tortaId = `torta-${randomUUID()}`;
  itensCardapio.push({
    id: tortaId,
    nome: 'Torta',
    descricao: '',
    categoria: 'sobremesas',
    precoCentavos: 1000,
    estoque: 5,
    disponivel: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.MOCK_PIX_PAGAR_APOS_SEGUNDOS;
  delete process.env.MOCK_PIX_ATRASO_MS;
  delete process.env.PIX_TEMPO_LIMITE_MS;
  itensCardapio.splice(
    itensCardapio.findIndex((item) => item.id === tortaId),
    1,
  );
  Object.assign(config, criarConfigPadrao());
});

describe('Pix: QR Code dinâmico', () => {
  it('mostra QR, valor e prazo, e reserva o pedido enquanto espera o banco', async () => {
    const pedidoId = await pedidoComTorta();
    const resultado = await pagarPix(pedidoId);

    expect(resultado.status).toBe('pendente');
    expect(resultado.pix).toMatchObject({ valorCentavos: 2000, status: 'pendente' });
    expect(resultado.pix?.copiaECola).toMatch(/^000201/);
    expect((await consultarPix(pedidoId, gateway, emissor)).segundosRestantes).toBe(300);

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.status).toBe('aguardando_pix');
    expect(pedido.numero).toMatch(/^\d{3}$/);
    expect(torta()?.estoque).toBe(3);
    // Com o Pix na tela, o carrinho não muda.
    await expect(
      adicionarItem({ pedidoId, item: { itemCardapioId: tortaId, nome: 'x', quantidade: 1 } }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('nova tentativa (reconexão) devolve o mesmo QR, sem nova cobrança', async () => {
    const pedidoId = await pedidoComTorta();
    const primeiro = await pagarPix(pedidoId);
    const segundo = await pagarPix(pedidoId);
    expect(segundo.pix?.transacaoId).toBe(primeiro.pix?.transacaoId);
    expect(gateway.criadas.size).toBe(1);
  });

  it('pagamento confirmado pelo webhook avança o pedido, emite a NFC-e e credita pontos', async () => {
    const pedidoId = await pedidoComTorta();
    await identificar(pedidoId, '52998224725', 0);
    const { pix } = await pagarPix(pedidoId);

    await clientePaga(pix!.transacaoId);

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.status).toBe('pago');
    expect(pedido.transacaoId).toBe(pix!.transacaoId);
    expect(pedido.pix?.status).toBe('paga');
    expect(pedido.pontosAcumulados).toBeGreaterThan(0);
    expect(comprovantes.get(pedidoId)?.nota?.status).toBe('autorizada');
    expect((await consultarPix(pedidoId, gateway, emissor)).statusPedido).toBe('pago');
  });

  it('webhook repetido não paga de novo nem estorna', async () => {
    const pedidoId = await pedidoComTorta();
    const { pix } = await pagarPix(pedidoId);
    await clientePaga(pix!.transacaoId);
    await processarNotificacaoPix(pix!.transacaoId, gateway, emissor);
    expect(gateway.estornadas).toEqual([]);
  });
});

describe('Pix: QR expirado e cancelamento', () => {
  it('QR expirado volta ao carrinho intacto, devolve estoque e pontos e permite novo QR', async () => {
    const pedidoId = await pedidoComTorta();
    await identificar(pedidoId, '11144477735', 500);
    await usarPontos({ pedidoId, pontos: 300 });
    const cliente = clientesFidelidade.get('11144477735')!;
    const { pix } = await pagarPix(pedidoId);
    expect(cliente.pontos).toBe(200); // reservados
    expect((await obterCarrinho(pedidoId)).pontosPrevistos).toBeGreaterThan(0);

    passarDoPrazo();
    await verificarCobrancasPix(gateway, emissor);

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.status).toBe('em_montagem');
    expect(pedido.pix?.status).toBe('expirada');
    expect(pedido.itens).toHaveLength(1);
    expect(pedido.pontosUsados).toBe(300);
    expect(pedido.pontosPrevistos).toBeUndefined();
    expect(pedido.numero).toBeUndefined();
    expect(cliente.pontos).toBe(500); // reserva desfeita
    expect(torta()?.estoque).toBe(5);
    expect((await gateway.consultarStatus(pix!.transacaoId)).status).toBe('cancelado');

    const novo = await pagarPix(pedidoId);
    expect(novo.pix?.transacaoId).not.toBe(pix!.transacaoId);
    expect(novo.pix?.valorCentavos).toBe(pix!.valorCentavos);
  });

  it('o próprio totem perguntando também expira o QR vencido', async () => {
    const pedidoId = await pedidoComTorta();
    await pagarPix(pedidoId);
    passarDoPrazo();
    const situacao = await consultarPix(pedidoId, gateway, emissor);
    expect(situacao).toMatchObject({ statusPedido: 'em_montagem', segundosRestantes: 0 });
    expect(situacao.pix?.status).toBe('expirada');
  });

  it('cancelar desfaz a reserva; Pix já pago não é cancelado', async () => {
    const pedidoId = await pedidoComTorta();
    await pagarPix(pedidoId);
    const cancelado = await cancelarPix(pedidoId, gateway, emissor);
    expect(cancelado.statusPedido).toBe('em_montagem');
    expect(torta()?.estoque).toBe(5);

    const outro = await pedidoComTorta();
    const { pix } = await pagarPix(outro);
    gateway.aoNotificar(() => undefined); // o aviso do banco ainda não chegou
    await gateway.pagar(pix!.transacaoId);
    expect((await cancelarPix(outro, gateway, emissor)).statusPedido).toBe('pago');
  });
});

describe('Pix: instabilidade', () => {
  it('banco sem resposta: avisa (504), mantém o carrinho e a nova tentativa usa a mesma cobrança', async () => {
    process.env.MOCK_PIX_ATRASO_MS = '40';
    process.env.PIX_TEMPO_LIMITE_MS = '5';
    const pedidoId = await pedidoComTorta();

    await expect(pagarPix(pedidoId)).rejects.toMatchObject({
      statusCode: 504,
      message: expect.stringMatching(/instável.*carrinho foi mantido/i),
    });
    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.status).toBe('em_montagem');
    expect(pedido.itens).toHaveLength(1);
    expect(torta()?.estoque).toBe(5);

    // O banco criou a cobrança depois do tempo limite; a nova tentativa recebe a mesma.
    await new Promise((resolver) => setTimeout(resolver, 60));
    process.env.PIX_TEMPO_LIMITE_MS = '1000';
    const novo = await pagarPix(pedidoId);
    expect(novo.status).toBe('pendente');
    expect(gateway.criadas.size).toBe(1);
  });

  it('confirmação atrasada (depois de o QR expirar) concilia o pedido sem nova cobrança', async () => {
    const pedidoId = await pedidoComTorta();
    const { pix } = await pagarPix(pedidoId);
    passarDoPrazo();
    await verificarCobrancasPix(gateway, emissor);
    expect((await obterCarrinho(pedidoId)).status).toBe('em_montagem');

    await clientePaga(pix!.transacaoId); // o banco aceitou no último segundo e avisou tarde

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido).toMatchObject({ status: 'pago', conciliadoComAtraso: true });
    expect(pedido.numero).toMatch(/^\d{3}$/);
    expect(torta()?.estoque).toBe(3);
    expect(gateway.estornadas).toEqual([]);
  });

  it('QR antigo pago enquanto um novo está na tela: vale o antigo e o novo é cancelado', async () => {
    const pedidoId = await pedidoComTorta();
    const antigo = await pagarPix(pedidoId);
    passarDoPrazo();
    const novo = await pagarPix(pedidoId);

    await clientePaga(antigo.pix!.transacaoId);

    expect((await obterCarrinho(pedidoId)).status).toBe('pago');
    expect((await gateway.consultarStatus(novo.pix!.transacaoId)).status).toBe('cancelado');
    expect(torta()?.estoque).toBe(3); // reservado uma vez só
  });

  it('cliente que pagou dois QR tem o segundo pagamento estornado', async () => {
    const pedidoId = await pedidoComTorta();
    const antigo = await pagarPix(pedidoId);
    passarDoPrazo();
    await verificarCobrancasPix(gateway, emissor);
    const novo = await pagarPix(pedidoId);

    await clientePaga(novo.pix!.transacaoId);
    await clientePaga(antigo.pix!.transacaoId);

    expect((await obterCarrinho(pedidoId)).transacaoId).toBe(novo.pix!.transacaoId);
    expect(gateway.estornadas).toEqual([antigo.pix!.transacaoId]);
  });

  it('pagamento atrasado de um carrinho que mudou é estornado', async () => {
    const pedidoId = await pedidoComTorta();
    const { pix } = await pagarPix(pedidoId);
    await cancelarPix(pedidoId, gateway, emissor);
    await adicionarItem({ pedidoId, item: { itemCardapioId: tortaId, nome: 'x', quantidade: 1 } });

    await clientePaga(pix!.transacaoId);

    expect((await obterCarrinho(pedidoId)).status).toBe('em_montagem');
    expect(gateway.estornadas).toEqual([pix!.transacaoId]);
  });

  it('aviso de uma transação desconhecida não paga nada', async () => {
    const desconhecida = randomUUID();
    await expect(processarNotificacaoPix(desconhecida, gateway, emissor)).rejects.toThrow();
    expect([...pedidos.values()].some((p) => p.transacaoId === desconhecida)).toBe(false);
  });
});
