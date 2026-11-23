import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { comprovantes, registrosConsentimento } from '../../db/memory-store';
import {
  ErroFiscal,
  MockEmissorFiscal,
  type EmitirNotaFiscalParams,
  type NotaFiscalEmitida,
} from '../../integrations/api-fiscal';
import { MockPagamentoGateway } from '../../integrations/gateway-pagamento';
import {
  MockServicoNotificacao,
  type EnviarComprovanteParams,
} from '../../integrations/notificacao';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import {
  enviarComprovante,
  obterComprovante,
  reemitirNota,
  reenviarComprovante,
} from '../comprovante/comprovante.service';
import { registrarConsentimentos } from '../consentimento/consentimento.service';
import { VERSAO_TERMO } from '../consentimento/termo';
import { informarCpfNota } from '../identificacao/identificacao.service';
import { escolherFormaPagamento } from '../pagamento/pagamento.service';
import { consultarPedidos } from './funcionario.service';

class EmissorComFalha extends MockEmissorFiscal {
  async emitirNotaFiscal(_params: EmitirNotaFiscalParams): Promise<NotaFiscalEmitida> {
    throw new ErroFiscal('Rejeição 539: duplicidade de NF-e');
  }
}

class NotificacaoRegistrada extends MockServicoNotificacao {
  enviados: EnviarComprovanteParams[] = [];

  async enviarComprovante(params: EnviarComprovanteParams): Promise<void> {
    this.enviados.push(params);
  }
}

async function pedidoPago(
  formaPagamento: 'credito' | 'debito',
  emissor = new MockEmissorFiscal(),
  cpf?: string,
): Promise<string> {
  const pedidoId = randomUUID();
  await adicionarItem({
    pedidoId,
    item: { itemCardapioId: 'batata-frita', nome: 'Batata Frita', quantidade: 1 },
  });
  if (cpf) {
    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { cpf_nota: true },
    });
    await informarCpfNota({ pedidoId, cpf });
  }
  await escolherFormaPagamento(
    { pedidoId, formaPagamento, consumo: 'local' },
    new MockPagamentoGateway(),
    emissor,
  );
  return pedidoId;
}

const consulta = async (filtro: Record<string, unknown>, pedidoId: string) =>
  (await consultarPedidos(filtro)).find((pedido) => pedido.id === pedidoId);

// US 15: NFC-e
describe('NFC-e na aprovação do pagamento', () => {
  it('pagamento aprovado autoriza a nota, com chave, QR Code de consulta e o CPF informado', async () => {
    const pedidoId = await pedidoPago('credito', new MockEmissorFiscal(), '12345678909');
    const comprovante = await obterComprovante(pedidoId);

    expect(comprovante.nota).toMatchObject({ status: 'autorizada', tentativas: 1 });
    expect(comprovante.nota?.chaveAcesso).toMatch(/^\d{44}$/);
    expect(comprovante.nota?.urlConsulta).toContain(comprovante.nota?.chaveAcesso);
    expect(comprovante.cpfNaNotaMascarado).toBe('***.456.789-**');
  });

  it('erro fiscal: o pedido fica pago, com número, e a falha é registrada', async () => {
    const pedidoId = await pedidoPago('credito', new EmissorComFalha());

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.status).toBe('pago');
    expect(pedido.numero).toMatch(/^\d{3}$/);
    const comprovante = await obterComprovante(pedidoId);
    expect(comprovante.nota).toMatchObject({
      status: 'falha',
      erro: 'Rejeição 539: duplicidade de NF-e',
    });

    // Aparece na consulta pela situação da nota e pode ser emitida de novo.
    expect(await consulta({ statusNota: 'falha' }, pedidoId)).toMatchObject({
      statusNota: 'falha',
      notaErro: 'Rejeição 539: duplicidade de NF-e',
    });
    const reemitida = await reemitirNota(pedidoId, new MockEmissorFiscal());
    expect(reemitida.nota).toMatchObject({ status: 'autorizada', tentativas: 2 });
  });
});

describe('consulta de pedidos', () => {
  it('filtra por período, situação da nota e forma de pagamento', async () => {
    const credito = await pedidoPago('credito');
    const debito = await pedidoPago('debito', new EmissorComFalha());
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(),
    );

    expect(await consulta({ formaPagamento: 'debito' }, credito)).toBeUndefined();
    expect(await consulta({ formaPagamento: 'debito' }, debito)).toBeDefined();
    expect(await consulta({ statusNota: 'autorizada' }, debito)).toBeUndefined();
    expect(await consulta({ statusNota: 'autorizada' }, credito)).toBeDefined();
    expect(await consulta({ de: hoje, ate: hoje }, credito)).toBeDefined();
    expect(await consulta({ de: '2000-01-01', ate: '2000-01-31' }, credito)).toBeUndefined();
    await expect(consultarPedidos({ de: '2026-02-30' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(consultarPedidos({ statusNota: 'xyz' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('LGPD: CPF e contato aparecem só mascarados', async () => {
    const pedidoId = await pedidoPago('credito', new MockEmissorFiscal(), '12345678909');
    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { comprovante: true },
    });
    await enviarComprovante(
      { pedidoId, canal: 'email', email: 'joao.silva@gmail.com' },
      new MockEmissorFiscal(),
      new MockServicoNotificacao(),
    );

    const pedido = await consulta({}, pedidoId);
    expect(pedido).toMatchObject({
      cpfNaNotaMascarado: '***.456.789-**',
      comprovanteCanal: 'email',
      comprovanteContatoMascarado: 'jo***@gm***.com',
    });
    expect(JSON.stringify(pedido)).not.toMatch(/12345678909|joao\.silva/);
  });
});

describe('reenvio do comprovante no balcão', () => {
  it('reenvia para o mesmo contato, sem o atendente ver o contato completo', async () => {
    const pedidoId = await pedidoPago('credito');
    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { comprovante: true },
    });
    await enviarComprovante(
      { pedidoId, canal: 'sms', telefone: '11987654321' },
      new MockEmissorFiscal(),
      new MockServicoNotificacao(),
    );
    const notificacao = new NotificacaoRegistrada();

    const resposta = await reenviarComprovante(pedidoId, { contatoOriginal: true }, notificacao);

    expect(resposta).toEqual({ canal: 'sms', contatoMascarado: '(11) *****-4321' });
    expect(notificacao.enviados[0].destino).toEqual({ canal: 'sms', telefone: '11987654321' });
    expect(notificacao.enviados[0].notaFiscalUrl).toContain('qrcode');
  });

  it('contato novo exige a autorização do cliente, que vai para a auditoria', async () => {
    const pedidoId = await pedidoPago('credito');
    const notificacao = new NotificacaoRegistrada();

    await expect(
      reenviarComprovante(pedidoId, { contatoOriginal: true }, notificacao),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      reenviarComprovante(pedidoId, { canal: 'email', email: 'a@b.com' }, notificacao),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      reenviarComprovante(
        pedidoId,
        { canal: 'email', email: 'invalido', autorizadoPeloCliente: true },
        notificacao,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    await reenviarComprovante(
      pedidoId,
      { canal: 'email', email: 'cliente@exemplo.com', autorizadoPeloCliente: true },
      notificacao,
    );
    expect(notificacao.enviados).toHaveLength(1);
    expect(comprovantes.get(pedidoId)?.destino?.email).toBe('cliente@exemplo.com');
    expect(registrosConsentimento.at(-1)).toMatchObject({
      pedidoId,
      finalidade: 'comprovante',
      aceito: true,
      origem: 'balcao',
    });
  });

  it('só pedido pago tem reenvio', async () => {
    await expect(
      reenviarComprovante(randomUUID(), { contatoOriginal: true }, new NotificacaoRegistrada()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
