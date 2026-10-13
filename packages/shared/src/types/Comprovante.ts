// Tipos referentes à emissão e ao envio do comprovante.
// Consumido por: apps/api/src/modules/comprovante, apps/api/src/integrations/notificacao,
// apps/api/src/integrations/api-fiscal, apps/totem/src/screens/Comprovante (US-08).

export type CanalComprovante = 'email' | 'sms';

export interface DestinoComprovante {
  canal: CanalComprovante;
  email?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  telefone?: string; // LGPD: dado pessoal — exige consentimento/criptografia
}

export interface Comprovante {
  pedidoId: string;
  // Ausente quando o cliente concluiu o pedido sem receber comprovante por e-mail/SMS.
  destino?: DestinoComprovante;
  notaFiscalUrl?: string;
  // US 09: CPF que saiu na nota fiscal, já mascarado para exibição (***.456.789-**).
  cpfNaNotaMascarado?: string;
  enviadoEm?: string;
}
