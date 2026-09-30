// Ilustração decorativa (emoji + cor de fundo) por categoria do cardápio.
// Não substitui a foto do item — é só a moldura visual dos cards.
export interface VisualCategoria {
  emoji: string;
  fundo: string;
}

const VISUAIS: Record<string, VisualCategoria> = {
  lanches: { emoji: '🍔', fundo: '#ffe3b3' },
  acompanhamentos: { emoji: '🍟', fundo: '#fff0b8' },
  bebidas: { emoji: '🥤', fundo: '#d8eef5' },
  sobremesas: { emoji: '🍨', fundo: '#f6ddf0' },
};

// US-01: categorias exibidas no totem, na ordem das abas (id = categoria do item).
export const CATEGORIAS: { id: string; nome: string }[] = [
  { id: 'lanches', nome: 'Lanches' },
  { id: 'acompanhamentos', nome: 'Acompanhamentos' },
  { id: 'bebidas', nome: 'Bebidas' },
  { id: 'sobremesas', nome: 'Sobremesas' },
];

const VISUAL_PADRAO: VisualCategoria = { emoji: '🍽️', fundo: '#f3e3cc' };

export function visualCategoria(categoria: string): VisualCategoria {
  return VISUAIS[categoria] ?? VISUAL_PADRAO;
}
