import { loadEnv } from '../config/env';
import { MockEmissorFiscal } from './api-fiscal';
import { MockPagamentoGateway } from './gateway-pagamento';
import {
  MockServicoNotificacao,
  SmtpServicoNotificacao,
  type ServicoNotificacao,
} from './notificacao';

// Uma instância de cada adapter para a API inteira: o Pix precisa que quem cria a
// cobrança (pagamento) e quem recebe o webhook enxerguem o mesmo gateway, e a numeração
// da NFC-e precisa ser única.
// TODO: trocar os Mock* restantes pelos adapters reais (escolhidos por variável de
// ambiente) quando existirem — só este arquivo muda.
export const gatewayPagamento = new MockPagamentoGateway();
export const emissorFiscal = new MockEmissorFiscal();

// E-mail real por SMTP quando SMTP_HOST está definido; sem ele, simulado. SMS: simulado.
function criarNotificacao(): ServicoNotificacao {
  const sms = new MockServicoNotificacao();
  const { smtp } = loadEnv();
  return smtp ? new SmtpServicoNotificacao(smtp, sms) : sms;
}

export const servicoNotificacao = criarNotificacao();
