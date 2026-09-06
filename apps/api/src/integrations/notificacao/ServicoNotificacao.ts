import type { DestinoComprovante } from '@totem/shared';

// Contrato de integração com o(s) provedor(es) de envio de e-mail/SMS.
// Consumido por: apps/api/src/modules/comprovante (US-08).
export interface EnviarComprovanteParams {
  destino: DestinoComprovante; // LGPD: dado pessoal — exige consentimento/criptografia
  notaFiscalUrl?: string;
}

export interface ServicoNotificacao {
  enviarComprovante(params: EnviarComprovanteParams): Promise<void>;
}
