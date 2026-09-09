import type { ResultadoPagamento } from '@totem/shared';
import type { PagamentoGateway } from '../../integrations/gateway-pagamento';
import { calcularTotalFinal, obterOuCriarPedido } from '../../db/memory-store';
import type { EscolherFormaPagamentoBody } from './pagamento.types';

// US-06: Escolher forma de pagamento — calcula o valor final (considerando o cupom
// aplicado, se houver) e delega a cobrança ao gateway. A implementação de
// PagamentoGateway é injetada para permitir troca de provedor sem alterar este
// módulo (ver integrations/gateway-pagamento).
export async function escolherFormaPagamento(
  body: EscolherFormaPagamentoBody,
  gateway: PagamentoGateway,
): Promise<ResultadoPagamento> {
  const pedido = obterOuCriarPedido(body.pedidoId);
  const valorCentavos = calcularTotalFinal(pedido);

  const resultado = await gateway.iniciarPagamento({
    pedidoId: pedido.id,
    formaPagamento: body.formaPagamento,
    valorCentavos,
  });

  if (resultado.status === 'autorizado') {
    pedido.status = 'pago';
  }

  return resultado;
}
