import type { ItemCardapio } from '@totem/shared';

// DTOs específicos do módulo de cardápio (Épico 1).
export interface ListarCardapioQuery {
  categoria?: string;
  busca?: string; // US-02: trecho do nome do item
}

export type ListarCardapioResponse = ItemCardapio[];
