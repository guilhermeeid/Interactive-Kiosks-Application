import type { CategoriaCardapio, ItemCardapio } from '@totem/shared';
import { urlImagem } from '../services/apiClient';
import { visualItem } from '../utils/visualCategoria';

// Foto do item; sem foto, o emoji do item ou da categoria sobre a cor da categoria.
export function FotoItem({
  item,
  categorias,
  className = 'foto-item',
}: {
  item: ItemCardapio;
  categorias: CategoriaCardapio[];
  className?: string;
}) {
  const visual = visualItem(item, categorias);
  return (
    <div className={className} style={{ background: visual.fundo }} aria-hidden="true">
      {item.imagemUrl ? <img src={urlImagem(item.imagemUrl)} alt="" /> : visual.icone}
    </div>
  );
}

// Ícone de uma categoria: imagem enviada pelo administrador ou emoji.
export function IconeCategoria({ categoria }: { categoria: CategoriaCardapio }) {
  if (categoria.iconeImagemUrl) {
    return <img className="icone-categoria" src={urlImagem(categoria.iconeImagemUrl)} alt="" />;
  }
  return categoria.icone ? <span aria-hidden="true">{categoria.icone}</span> : null;
}
