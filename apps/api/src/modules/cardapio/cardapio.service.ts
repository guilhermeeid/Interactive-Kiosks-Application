import type { ItemCardapio } from '@totem/shared';
import { itensCardapio } from '../../db/memory-store';
import type { ListarCardapioQuery } from './cardapio.types';

// US-01: Visualizar cardápio — retorna os itens disponíveis, com filtro opcional
// por categoria.
export async function listarCardapio(query: ListarCardapioQuery): Promise<ItemCardapio[]> {
  return itensCardapio.filter(
    (item) => item.disponivel && (!query.categoria || item.categoria === query.categoria),
  );
}
