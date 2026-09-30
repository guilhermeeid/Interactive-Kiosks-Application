import type { ItemCardapio } from '@totem/shared';
import { itensCardapio } from '../../db/memory-store';
import type { ListarCardapioQuery } from './cardapio.types';

// Normaliza para comparação: minúsculas e sem acentos ("Refrigerante" casa com "refri").
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

// US-01: Visualizar cardápio — retorna os itens, com filtro opcional por categoria.
// US-02: Buscar item pelo nome — filtro opcional por trecho do nome (`busca`).
// Itens indisponíveis também são retornados (com disponivel: false) para o totem
// exibi-los como esgotados; o bloqueio da adição fica no carrinho.
export async function listarCardapio(query: ListarCardapioQuery): Promise<ItemCardapio[]> {
  const busca = query.busca ? normalizar(query.busca) : '';

  return itensCardapio.filter(
    (item) =>
      (!query.categoria || item.categoria === query.categoria) &&
      (!busca || normalizar(item.nome).includes(busca)),
  );
}
