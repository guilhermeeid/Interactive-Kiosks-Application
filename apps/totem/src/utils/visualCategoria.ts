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

const VISUAL_PADRAO: VisualCategoria = { emoji: '🍽️', fundo: '#f3e3cc' };

export function visualCategoria(categoria: string): VisualCategoria {
  return VISUAIS[categoria] ?? VISUAL_PADRAO;
}
