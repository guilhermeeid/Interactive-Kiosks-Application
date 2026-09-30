import type { ItemCardapio } from '@totem/shared';
import { itensCardapio } from '../../db/memory-store';
import type { ListarCardapioQuery } from './cardapio.types';

// US-01: Visualizar cardápio — retorna os itens, com filtro opcional por categoria.
// Itens indisponíveis também são retornados (com disponivel: false) para o totem
// exibi-los como esgotados; o bloqueio da adição fica no carrinho.
export async function listarCardapio(query: ListarCardapioQuery): Promise<ItemCardapio[]> {
  return itensCardapio.filter((item) => !query.categoria || item.categoria === query.categoria);
}
