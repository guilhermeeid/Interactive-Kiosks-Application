import type { FormaPagamento, ResultadoPagamento } from '@totem/shared';

// DTOs específicos do módulo de pagamento (Épico 3).
// IMPORTANTE: nenhum campo de dado de cartão deve ser adicionado aqui — pagamento é
// sempre delegado ao gateway via tokenização (ver integrations/gateway-pagamento).
export interface EscolherFormaPagamentoBody {
  pedidoId: string;
  formaPagamento: FormaPagamento;
}

export type EscolherFormaPagamentoResponse = ResultadoPagamento;
