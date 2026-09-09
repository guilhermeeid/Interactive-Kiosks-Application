import type { ResultadoAplicacaoCupom } from '@totem/shared';
import { calcularResultadoCupom, cupons, obterOuCriarPedido } from '../../db/memory-store';
import { HttpError } from '../../errors';
import type { AplicarCupomBody } from './cupom.types';

// US-07: Aplicar cupom — valida código/vigência e calcula o desconto sobre o
// valor total do pedido no momento da aplicação.
export async function aplicarCupom(body: AplicarCupomBody): Promise<ResultadoAplicacaoCupom> {
  const pedido = obterOuCriarPedido(body.pedidoId);
  const cupom = cupons.get(body.codigo.toUpperCase());

  if (!cupom || !cupom.ativo) {
    throw new HttpError(400, `Cupom "${body.codigo}" inválido ou inativo`);
  }
  if (cupom.validoAte && new Date(cupom.validoAte).getTime() < Date.now()) {
    throw new HttpError(400, `Cupom "${body.codigo}" expirado`);
  }

  pedido.cupomAplicado = cupom.codigo;
  return calcularResultadoCupom(pedido, cupom);
}
