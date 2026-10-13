import type { CategoriaCardapio, ItemCardapio } from '@totem/shared';

// Moldura visual dos cards do cardápio: cor de fundo da área da foto e o emoji usado
// quando o item não tem foto. Nomes, ícones e ordem das categorias vêm da configuração
// do administrador; aqui fica só a paleta, atribuída pela posição da categoria.
const FUNDOS = ['#ffe3b3', '#fff0b8', '#d8eef5', '#f6ddf0', '#dff2d8', '#e6e0f8'];
const FUNDO_PADRAO = '#f3e3cc';
const ICONE_PADRAO = '🍽️';

export interface VisualItem {
  icone: string;
  fundo: string;
}

// O ícone do próprio item vence o da categoria; sem nenhum dos dois, usa o prato padrão.
export function visualItem(item: ItemCardapio, categorias: CategoriaCardapio[]): VisualItem {
  const indice = categorias.findIndex((categoria) => categoria.id === item.categoria);
  return {
    icone: item.icone ?? categorias[indice]?.icone ?? ICONE_PADRAO,
    fundo: indice === -1 ? FUNDO_PADRAO : FUNDOS[indice % FUNDOS.length],
  };
}
