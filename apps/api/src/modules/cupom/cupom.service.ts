import type { ResultadoAplicacaoCupom } from '@totem/shared';
import type { AplicarCupomBody } from './cupom.types';

// TODO: implementar US-07 (Aplicar cupom) — validar código, vigência (validoAte) e
// calcular o desconto sobre o valor total do pedido.
export async function aplicarCupom(body: AplicarCupomBody): Promise<ResultadoAplicacaoCupom> {
  throw new Error('aplicarCupom não implementado');
}
