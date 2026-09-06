import type { ItemCardapio } from '@totem/shared';

// DTOs específicos do módulo de cardápio (Épico 1).
export interface ListarCardapioQuery {
  categoria?: string;
}

export type ListarCardapioResponse = ItemCardapio[];
