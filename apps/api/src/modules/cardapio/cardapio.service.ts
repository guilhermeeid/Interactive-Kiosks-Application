import type { ItemCardapio } from '@totem/shared';
import type { ListarCardapioQuery } from './cardapio.types';

// TODO: implementar US-01 (Visualizar cardápio) — consultar itens disponíveis no
// banco (ver src/db/schema.ts -> ItemCardapioRow), com filtro opcional por categoria.
export async function listarCardapio(query: ListarCardapioQuery): Promise<ItemCardapio[]> {
  throw new Error('listarCardapio não implementado');
}
