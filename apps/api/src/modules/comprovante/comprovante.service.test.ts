import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MockEmissorFiscal,
  type EmitirNotaFiscalParams,
  type NotaFiscalEmitida,
} from '../../integrations/api-fiscal';
import { MockPagamentoGateway } from '../../integrations/gateway-pagamento';
import {
  MockServicoNotificacao,
  type EnviarComprovanteParams,
} from '../../integrations/notificacao';
import { comprovantes } from '../../db/memory-store';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { registrarConsentimentos } from '../consentimento/consentimento.service';
import type { RegistrarConsentimentosBody } from '../consentimento/consentimento.types';
import { VERSAO_TERMO } from '../consentimento/termo';
import { informarCpfNota, pularIdentificacao } from '../identificacao/identificacao.service';
import { escolherFormaPagamento } from '../pagamento/pagamento.service';
import { dispensarComprovante, enviarComprovante } from './comprovante.service';

// Emissor e notificação que guardam o que receberam, para conferir o que saiu daqui.
class EmissorRegistrado extends MockEmissorFiscal {
  recebidos: EmitirNotaFiscalParams[] = [];

  async emitirNotaFiscal(params: EmitirNotaFiscalParams): Promise<NotaFiscalEmitida> {
    this.recebidos.push(params);
    return super.emitirNotaFiscal(params);
  }
}

class NotificacaoRegistrada extends MockServicoNotificacao {
  enviados: EnviarComprovanteParams[] = [];

  async enviarComprovante(params: EnviarComprovanteParams): Promise<void> {
    this.enviados.push(params);
  }
}

const consentir = (pedidoId: string, decisoes: RegistrarConsentimentosBody['decisoes']) =>
  registrarConsentimentos({ pedidoId, versaoTermo: VERSAO_TERMO, decisoes });

async function pedidoComItem(): Promise<string> {
  const pedidoId = randomUUID();
  await adicionarItem({
    pedidoId,
    item: { itemCardapioId: 'refrigerante-lata', nome: 'Refrigerante (lata)', quantidade: 1 },
  });
  return pedidoId;
}

const pagar = (pedidoId: string) =>
  escolherFormaPagamento({ pedidoId, formaPagamento: 'dinheiro' }, new MockPagamentoGateway());

describe('enviarComprovante', () => {
  it('emite a nota fiscal, notifica o cliente e marca o pedido como finalizado', async () => {
    const pedidoId = await pedidoComItem();
    await pagar(pedidoId);
    await consentir(pedidoId, { comprovante: true });
    const notificacao = new NotificacaoRegistrada();

    const comprovante = await enviarComprovante(
      { pedidoId, canal: 'email', email: 'cliente@teste.com' },
      new MockEmissorFiscal(),
      notificacao,
    );

    expect(comprovante.notaFiscalUrl).toMatch(/^https:\/\/mock-fiscal\.local\/danfe\//);
    expect(comprovante.destino).toEqual({ canal: 'email', email: 'cliente@teste.com' });
    expect(notificacao.enviados).toHaveLength(1);

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.status).toBe('finalizado');
  });

  // US 29
  it('sem o consentimento registrado, recusa o e-mail/telefone e nada é guardado nem enviado', async () => {
    const pedidoId = await pedidoComItem();
    await pagar(pedidoId);
    const notificacao = new NotificacaoRegistrada();

    await expect(
      enviarComprovante(
        { pedidoId, canal: 'sms', telefone: '11999998888' },
        new MockEmissorFiscal(),
        notificacao,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(notificacao.enviados).toEqual([]);
    expect(comprovantes.has(pedidoId)).toBe(false);

    await consentir(pedidoId, { comprovante: false });
    await expect(
      enviarComprovante(
        { pedidoId, canal: 'sms', telefone: '11999998888' },
        new MockEmissorFiscal(),
        notificacao,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('exige o contato do canal escolhido e um pedido já pago', async () => {
    const pedidoId = await pedidoComItem();
    await consentir(pedidoId, { comprovante: true });
    const enviar = (corpo: { canal: 'email' | 'sms'; email?: string; telefone?: string }) =>
      enviarComprovante({ pedidoId, ...corpo }, new MockEmissorFiscal(), new MockServicoNotificacao());

    await expect(enviar({ canal: 'email', email: '  ' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(enviar({ canal: 'sms', email: 'a@b.com' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(enviar({ canal: 'email', email: 'a@b.com' })).rejects.toMatchObject({
      statusCode: 409,
      message: 'O pedido ainda não foi pago',
    });
  });
});

// US 09
describe('CPF na nota fiscal', () => {
  it('CPF válido informado pelo cliente segue para o emissor e consta na nota emitida', async () => {
    const pedidoId = await pedidoComItem();
    await consentir(pedidoId, { cpf_nota: true });
    await informarCpfNota({ pedidoId, cpf: '123.456.789-09' });
    await pagar(pedidoId);
    const emissor = new EmissorRegistrado();

    const comprovante = await dispensarComprovante({ pedidoId }, emissor);

    expect(emissor.recebidos).toHaveLength(1);
    expect(emissor.recebidos[0].cpfNaNota).toBe('12345678909');
    // Na tela pública do totem o CPF aparece só em parte.
    expect(comprovante.cpfNaNotaMascarado).toBe('***.456.789-**');
  });

  it('sem CPF, a nota é emitida sem identificação do consumidor', async () => {
    const pedidoId = await pedidoComItem();
    await pagar(pedidoId);
    const emissor = new EmissorRegistrado();

    const comprovante = await dispensarComprovante({ pedidoId }, emissor);

    expect(emissor.recebidos[0].cpfNaNota).toBeUndefined();
    expect(comprovante.cpfNaNotaMascarado).toBeUndefined();
  });

  it('CPF de quem voltou atrás no consentimento não vai para a nota', async () => {
    const pedidoId = await pedidoComItem();
    await consentir(pedidoId, { cpf_nota: true });
    await informarCpfNota({ pedidoId, cpf: '12345678909' });
    await consentir(pedidoId, { cpf_nota: false });
    await pagar(pedidoId);
    const emissor = new EmissorRegistrado();

    await dispensarComprovante({ pedidoId }, emissor);
    expect(emissor.recebidos[0].cpfNaNota).toBeUndefined();
  });
});

// US 10 / US 29
describe('dispensarComprovante', () => {
  it('conclui o pedido com nota fiscal, sem pedir nem guardar e-mail ou telefone', async () => {
    const pedidoId = await pedidoComItem();
    await pagar(pedidoId);

    const comprovante = await dispensarComprovante({ pedidoId }, new MockEmissorFiscal());

    expect(comprovante.destino).toBeUndefined();
    expect(comprovante.enviadoEm).toBeUndefined();
    expect(comprovante.notaFiscalUrl).toMatch(/danfe/);
    expect((await obterCarrinho(pedidoId)).status).toBe('finalizado');
  });

  it('emite uma nota só, mesmo se chamado mais de uma vez', async () => {
    const pedidoId = await pedidoComItem();
    await pagar(pedidoId);
    const emissor = new EmissorRegistrado();

    const primeiro = await dispensarComprovante({ pedidoId }, emissor);
    const segundo = await dispensarComprovante({ pedidoId }, emissor);

    expect(emissor.recebidos).toHaveLength(1);
    expect(segundo.notaFiscalUrl).toBe(primeiro.notaFiscalUrl);
  });

  it('quem pulou a identificação fecha o pedido sem nenhum dado pessoal vinculado', async () => {
    const pedidoId = await pedidoComItem();
    await pularIdentificacao({ pedidoId, versaoTermo: VERSAO_TERMO });
    await pagar(pedidoId);
    const emissor = new EmissorRegistrado();
    const notificacao = new NotificacaoRegistrada();

    // O totem nem oferece o envio; se alguém tentar pela API, é recusado.
    await expect(consentir(pedidoId, { comprovante: true })).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(
      enviarComprovante({ pedidoId, canal: 'email', email: 'a@b.com' }, emissor, notificacao),
    ).rejects.toMatchObject({ statusCode: 403 });

    const comprovante = await dispensarComprovante({ pedidoId }, emissor);
    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.cpfNaNota).toBeUndefined();
    expect(pedido.clienteId).toBeUndefined();
    expect(comprovante.destino).toBeUndefined();
    expect(comprovante.cpfNaNotaMascarado).toBeUndefined();
    expect(notificacao.enviados).toEqual([]);
  });

  it('recusa pedido que ainda não foi pago', async () => {
    const pedidoId = await pedidoComItem();
    await expect(dispensarComprovante({ pedidoId }, new MockEmissorFiscal())).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
