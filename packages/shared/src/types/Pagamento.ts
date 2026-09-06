// Tipos referentes a pagamento.
// Consumido por: apps/api/src/modules/pagamento, apps/api/src/integrations/gateway-pagamento,
// apps/totem/src/screens/Pagamento (US-06).
//
// IMPORTANTE: nenhum dado de cartão (número, validade, CVV) deve ser modelado aqui.
// O pagamento é sempre delegado ao gateway/adquirente via tokenização — ver
// apps/api/src/integrations/gateway-pagamento/PagamentoGateway.ts.

export type FormaPagamento = 'credito' | 'debito' | 'pix' | 'dinheiro';

export type StatusPagamento = 'pendente' | 'autorizado' | 'recusado' | 'estornado';

export interface ResultadoPagamento {
  transacaoId: string;
  formaPagamento: FormaPagamento;
  status: StatusPagamento;
  valorCentavos: number;
  autorizadoEm?: string;
}
