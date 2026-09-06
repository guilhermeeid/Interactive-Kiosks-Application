import type { FormaPagamento, ResultadoPagamento } from '@totem/shared';

// Contrato de integração com o gateway/adquirente de pagamento.
// Consumido por: apps/api/src/modules/pagamento (US-06).
//
// IMPORTANTE: nenhuma implementação deste contrato deve receber, transportar ou
// armazenar dados de cartão (número, validade, CVV). A tokenização/captura do
// cartão acontece inteiramente do lado do gateway (SDK do pinpad/terminal); esta
// interface troca apenas identificadores de transação e status.
export interface IniciarPagamentoParams {
  pedidoId: string;
  formaPagamento: FormaPagamento;
  valorCentavos: number;
}

export interface PagamentoGateway {
  iniciarPagamento(params: IniciarPagamentoParams): Promise<ResultadoPagamento>;
  consultarStatus(transacaoId: string): Promise<ResultadoPagamento>;
  estornar(transacaoId: string): Promise<void>;
}
