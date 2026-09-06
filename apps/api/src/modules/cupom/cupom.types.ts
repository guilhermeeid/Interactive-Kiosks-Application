import type { ResultadoAplicacaoCupom } from '@totem/shared';

// DTOs específicos do módulo de cupom (Épico 3).
export interface AplicarCupomBody {
  pedidoId: string;
  codigo: string;
}

export type AplicarCupomResponse = ResultadoAplicacaoCupom;
