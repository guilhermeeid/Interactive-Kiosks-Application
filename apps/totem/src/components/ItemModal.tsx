import { useState } from 'react';
import type { CategoriaCardapio, ItemCardapio } from '@totem/shared';
import { formatarCentavos } from '../utils/formatarMoeda';
import { BotaoTouch } from './BotaoTouch';
import { FotoItem } from './FotoItem';
import { Modal } from './Modal';
import { SeletorQuantidade } from './SeletorQuantidade';

// US-03: detalhe do item tocado no cardápio — foto, descrição, o que vem no combo e a
// quantidade a adicionar. `restante` é quanto ainda cabe no estoque além do que já está
// no carrinho (ausente = sem limite).
export interface ItemModalProps {
  item: ItemCardapio;
  categorias: CategoriaCardapio[];
  // Nomes dos itens do cardápio, para listar o que vem no combo.
  nomeDoItem: (id: string) => string;
  restante?: number;
  aoAdicionar: (quantidade: number) => Promise<void>;
  aoTocarNoLimite: () => void;
  aoFechar: () => void;
}

export function ItemModal({
  item,
  categorias,
  nomeDoItem,
  restante,
  aoAdicionar,
  aoTocarNoLimite,
  aoFechar,
}: ItemModalProps) {
  const [quantidade, setQuantidade] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const semEspaco = restante !== undefined && restante <= 0;

  async function adicionar() {
    setEnviando(true);
    try {
      await aoAdicionar(quantidade);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      titulo={item.nome}
      aoFechar={aoFechar}
      rotuloFechar="Voltar"
      acoes={
        <BotaoTouch
          variante="primario"
          onClick={adicionar}
          disabled={!item.disponivel || semEspaco || enviando}
        >
          {!item.disponivel
            ? 'Indisponível'
            : semEspaco
              ? 'Máximo no carrinho'
              : `Adicionar · ${formatarCentavos(item.precoCentavos * quantidade)}`}
        </BotaoTouch>
      }
    >
      <div className="item-detalhe">
        <FotoItem item={item} categorias={categorias} className="item-detalhe__foto" />
        <p>{item.disponivel ? item.descricao : 'Item indisponível no momento'}</p>
        {item.componentes && (
          <p className="item-detalhe__combo">
            Inclui:{' '}
            {item.componentes
              .map((parte) => `${parte.quantidade}× ${nomeDoItem(parte.itemCardapioId)}`)
              .join(', ')}
          </p>
        )}
        <div className="item-detalhe__rodape">
          <span className="preco">{formatarCentavos(item.precoCentavos)}</span>
          {item.disponivel && !semEspaco && (
            <SeletorQuantidade
              valor={quantidade}
              nomeItem={item.nome}
              minimo={1}
              maximo={restante}
              aoMudar={setQuantidade}
              aoTocarNoLimite={aoTocarNoLimite}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
