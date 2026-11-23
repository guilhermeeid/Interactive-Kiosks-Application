// Tipos referentes à emissão e ao envio do comprovante.
// Consumido por: apps/api/src/modules/comprovante, apps/api/src/integrations/notificacao,
// apps/api/src/integrations/api-fiscal, apps/totem/src/screens/Comprovante (US-08).

export type CanalComprovante = 'email' | 'sms';

export interface DestinoComprovante {
  canal: CanalComprovante;
  email?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  telefone?: string; // LGPD: dado pessoal — exige consentimento/criptografia
}

// Situação da NFC-e. `falha` = a SEFAZ/provedor recusou ou não respondeu: o pedido é
// concluído assim mesmo, a falha fica registrada e a emissão pode ser refeita.
export type StatusNotaFiscal = 'autorizada' | 'falha';

// Para a consulta de pedidos: além das duas acima, `pendente` (pedido ainda não pago,
// ex.: no caixa ou com Pix na tela) e `nao_emitida` (pedido cancelado).
export type StatusNotaConsulta = StatusNotaFiscal | 'pendente' | 'nao_emitida';

export interface NotaFiscalPedido {
  status: StatusNotaFiscal;
  numero?: string;
  serie?: string;
  chaveAcesso?: string; // 44 dígitos
  urlConsulta?: string; // conteúdo do QR Code da NFC-e (consulta pública na SEFAZ)
  urlDanfe?: string;
  erro?: string; // motivo da falha, quando houver
  tentativas: number;
  ultimaTentativaEm: string;
  autorizadaEm?: string;
}

export interface Comprovante {
  pedidoId: string;
  // NFC-e: emitida assim que o pagamento é aprovado, antes do e-mail/SMS.
  nota?: NotaFiscalPedido;
  // Ausente quando o cliente concluiu o pedido sem receber comprovante por e-mail/SMS.
  destino?: DestinoComprovante;
  notaFiscalUrl?: string;
  // US 09: CPF que saiu na nota fiscal, já mascarado para exibição (***.456.789-**).
  cpfNaNotaMascarado?: string;
  enviadoEm?: string;
  // Última tentativa de envio que falhou (o totem ofereceu tentar de novo ou outro canal).
  // Some quando um envio dá certo.
  falhaEnvio?: { canal: CanalComprovante; erro: string; em: string };
}
