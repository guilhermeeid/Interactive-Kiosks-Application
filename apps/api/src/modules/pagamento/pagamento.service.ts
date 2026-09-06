import type { ResultadoPagamento } from '@totem/shared';
import type { PagamentoGateway } from '../../integrations/gateway-pagamento';
import type { EscolherFormaPagamentoBody } from './pagamento.types';

// TODO: implementar US-06 (Escolher forma de pagamento) — calcular valor total do
// pedido (itens + cupom, ver módulo cupom) e iniciar a transação via `gateway`.
// A implementação de `PagamentoGateway` é injetada para permitir troca de provedor
// sem alterar este módulo (ver integrations/gateway-pagamento).
export async function escolherFormaPagamento(
  body: EscolherFormaPagamentoBody,
  gateway: PagamentoGateway,
): Promise<ResultadoPagamento> {
  throw new Error('escolherFormaPagamento não implementado');
}
