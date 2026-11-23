import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { comprovantes } from '../../db/memory-store';
import { MockEmissorFiscal } from '../../integrations/api-fiscal';
import { MockPagamentoGateway } from '../../integrations/gateway-pagamento';
import {
  ErroNotificacao,
  MockServicoNotificacao,
  type EnviarComprovanteParams,
} from '../../integrations/notificacao';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { registrarConsentimentos } from '../consentimento/consentimento.service';
import { VERSAO_TERMO } from '../consentimento/termo';
import { consultarPedidos } from '../funcionario/funcionario.service';
import { escolherFormaPagamento } from '../pagamento/pagamento.service';
import { celularValido, emailValido } from './contato';
import { enviarComprovante, obterComprovante } from './comprovante.service';

// Provedor que falha nos canais pedidos e guarda o que entregou.
class Provedor extends MockServicoNotificacao {
  entregues: EnviarComprovanteParams[] = [];
  falhaEm = new Set<'email' | 'sms'>();

  async enviarComprovante(params: EnviarComprovanteParams): Promise<void> {
    if (this.falhaEm.has(params.destino.canal)) {
      throw new ErroNotificacao('SMTP 421: serviço indisponível');
    }
    this.entregues.push(params);
  }
}

async function pedidoPagoComConsentimento(): Promise<string> {
  const pedidoId = randomUUID();
  await adicionarItem({
    pedidoId,
    item: { itemCardapioId: 'lanche-classico', nome: 'x', quantidade: 2 },
  });
  await escolherFormaPagamento(
    { pedidoId, formaPagamento: 'credito', consumo: 'local' },
    new MockPagamentoGateway(),
    new MockEmissorFiscal(),
  );
  await registrarConsentimentos({
    pedidoId,
    versaoTermo: VERSAO_TERMO,
    decisoes: { comprovante: true },
  });
  return pedidoId;
}

const enviar = (
  pedidoId: string,
  provedor: Provedor,
  destino: { canal: 'email' | 'sms'; email?: string; telefone?: string },
) => enviarComprovante({ pedidoId, ...destino }, new MockEmissorFiscal(), provedor);

afterEach(() => {
  delete process.env.MOCK_NOTIFICACAO_FALHA;
  vi.restoreAllMocks();
});

describe('validação do contato', () => {
  it('e-mail e celular conferidos pela sintaxe, DDD e nono dígito', () => {
    expect(emailValido('cliente@exemplo.com.br')).toBe(true);
    expect(emailValido('cliente@exemplo')).toBe(false);
    expect(celularValido('21987654321')).toBe(true);
    expect(celularValido('2187654321')).toBe(false);
  });

  it('contato inválido é recusado com o que corrigir, sem enviar nada', async () => {
    const pedidoId = await pedidoPagoComConsentimento();
    const provedor = new Provedor();
    await expect(
      enviar(pedidoId, provedor, { canal: 'email', email: 'joao@' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/E-mail inválido/),
    });
    await expect(
      enviar(pedidoId, provedor, { canal: 'sms', telefone: '1134567890' }),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Número inválido/) });
    expect(provedor.entregues).toEqual([]);
  });
});

describe('envio do comprovante', () => {
  it('e-mail válido e consentido: envia o comprovante com itens, total e o link da nota', async () => {
    const pedidoId = await pedidoPagoComConsentimento();
    const provedor = new Provedor();
    await enviar(pedidoId, provedor, { canal: 'email', email: 'cliente@exemplo.com' });

    const { mensagem, notaFiscalUrl } = provedor.entregues[0];
    const nota = (await obterComprovante(pedidoId)).nota;
    expect(notaFiscalUrl).toBe(nota?.urlConsulta);
    expect(mensagem.assunto).toMatch(/Comprovante do pedido nº \d{3}/);
    expect(mensagem.texto).toContain('2× Lanche Clássico');
    expect(mensagem.texto).toContain(nota?.urlConsulta);
    expect(mensagem.html).toContain(`href="${nota?.urlConsulta}"`);
  });

  it('celular válido e consentido: SMS curto com o link direto da nota', async () => {
    const pedidoId = await pedidoPagoComConsentimento();
    const provedor = new Provedor();
    await enviar(pedidoId, provedor, { canal: 'sms', telefone: '(11) 98765-4321' });

    expect(provedor.entregues[0].destino).toEqual({ canal: 'sms', telefone: '11987654321' });
    const { sms } = provedor.entregues[0].mensagem;
    expect(sms).toContain((await obterComprovante(pedidoId)).nota?.urlConsulta);
    expect(sms.length).toBeLessThan(300);
  });

  it('falha no envio: avisa (502), registra e permite tentar de novo ou outro canal', async () => {
    const pedidoId = await pedidoPagoComConsentimento();
    const provedor = new Provedor();
    provedor.falhaEm.add('email');

    await expect(
      enviar(pedidoId, provedor, { canal: 'email', email: 'cliente@exemplo.com' }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'FALHA_ENVIO' });
    // O pedido não é afetado; a falha aparece para a loja.
    expect((await obterCarrinho(pedidoId)).status).toBe('finalizado');
    expect(comprovantes.get(pedidoId)?.falhaEnvio).toMatchObject({ canal: 'email' });
    expect((await consultarPedidos({})).find((p) => p.id === pedidoId)?.comprovanteFalha).toMatch(
      /e-mail falhou/,
    );

    // Canal alternativo dá certo e limpa a falha.
    const comprovante = await enviar(pedidoId, provedor, { canal: 'sms', telefone: '11987654321' });
    expect(comprovante.enviadoEm).toBeDefined();
    expect(comprovante.falhaEnvio).toBeUndefined();

    // Retentativa no mesmo canal, depois que o provedor volta.
    provedor.falhaEm.clear();
    await enviar(pedidoId, provedor, { canal: 'email', email: 'cliente@exemplo.com' });
    expect(provedor.entregues).toHaveLength(2);
  });

  it('o mock simula falha por canal e não escreve o contato no log', async () => {
    const pedidoId = await pedidoPagoComConsentimento();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.MOCK_NOTIFICACAO_FALHA = 'sms';
    const mock = new MockServicoNotificacao();

    await expect(
      enviarComprovante(
        { pedidoId, canal: 'sms', telefone: '11987654321' },
        new MockEmissorFiscal(),
        mock,
      ),
    ).rejects.toMatchObject({ statusCode: 502 });
    await enviarComprovante(
      { pedidoId, canal: 'email', email: 'cliente@exemplo.com' },
      new MockEmissorFiscal(),
      mock,
    );
    expect(log.mock.calls.flat().join(' ')).not.toContain('cliente@exemplo.com');
  });
});
