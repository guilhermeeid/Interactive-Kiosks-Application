// Tipos referentes a pagamento.
// Consumido por: apps/api/src/modules/pagamento, apps/api/src/integrations/gateway-pagamento,
// apps/totem/src/screens/Pagamento (US-06).
//
// IMPORTANTE: nenhum dado de cartão (número, validade, CVV) deve ser modelado aqui.
// O pagamento é sempre delegado ao gateway/adquirente via tokenização — ver
// apps/api/src/integrations/gateway-pagamento/PagamentoGateway.ts.

// Vale-refeição e vale-alimentação são meios de pagamento próprios, não crédito nem
// débito: têm códigos próprios na NFC-e (tPag 11 e 10) e são habilitados separadamente
// na credenciadora (produto "voucher" da maquininha/pinpad).
// Dinheiro não passa pelo totem: o cliente paga no caixa, com atendente.
export type FormaPagamento =
  'credito' | 'debito' | 'pix' | 'vale_refeicao' | 'vale_alimentacao' | 'dinheiro';

// `pendente` = pagamento em dinheiro, a ser feito no caixa.
export type StatusPagamento = 'pendente' | 'autorizado' | 'recusado' | 'estornado';

export interface ResultadoPagamento {
  transacaoId: string;
  formaPagamento: FormaPagamento;
  status: StatusPagamento;
  valorCentavos: number;
  autorizadoEm?: string;
}
