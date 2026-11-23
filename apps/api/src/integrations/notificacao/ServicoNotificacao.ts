import type { DestinoComprovante } from '@totem/shared';

// Contrato de integração com o(s) provedor(es) de envio de e-mail/SMS.
// Consumido por: apps/api/src/modules/comprovante (US-08 / US 41 / US 42).

// O conteúdo já vem pronto do módulo de comprovante; o adapter só transporta.
export interface MensagemComprovante {
  assunto: string; // e-mail
  texto: string; // e-mail, versão em texto puro
  html: string; // e-mail
  sms: string; // curto, com o link direto da nota
}

export interface EnviarComprovanteParams {
  destino: DestinoComprovante; // LGPD: dado pessoal — exige consentimento/criptografia
  notaFiscalUrl?: string; // link de consulta da NFC-e (também dentro da mensagem)
  mensagem: MensagemComprovante;
}

// Falha de envio (provedor recusou, fora do ar, tempo esgotado). Quem chama avisa o
// cliente e oferece tentar de novo ou outro canal.
export class ErroNotificacao extends Error {}

export interface ServicoNotificacao {
  // Entrega a mensagem ou lança erro (de preferência ErroNotificacao, com o motivo).
  enviarComprovante(params: EnviarComprovanteParams): Promise<void>;
}
