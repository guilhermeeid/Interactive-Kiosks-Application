import { useEffect, useState } from 'react';
import type { ItemCardapio } from '@totem/shared';
import { adicionarItemCarrinho, buscarCardapio } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';
import { BotaoTouch } from '../../components/BotaoTouch';
import { formatarCentavos } from '../../utils/formatarMoeda';
import { visualCategoria } from '../../utils/visualCategoria';

// US-01: Visualizar cardápio.
export function CardapioScreen() {
  const [itens, setItens] = useState<ItemCardapio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const { pedidoId, pedido, recarregarPedido, irParaEtapa } = usePedido();

  useEffect(() => {
    buscarCardapio()
      .then(setItens)
      .catch((err: Error) => setErro(err.message))
      .finally(() => setCarregando(false));
  }, []);

  // US-02: Adicionar ao carrinho
  async function adicionar(item: ItemCardapio) {
    try {
      await adicionarItemCarrinho(pedidoId, {
        itemCardapioId: item.id,
        nome: item.nome,
        quantidade: 1,
      });
      await recarregarPedido();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const quantidadeNoCarrinho =
    pedido?.itens.reduce((total, item) => total + item.quantidade, 0) ?? 0;

  return (
    <div className="tela">
      <h1 className="tela__titulo">Cardápio</h1>
      <p className="tela__subtitulo">Escolha seus favoritos e monte seu pedido.</p>
      {carregando && <p className="aviso">Carregando cardápio...</p>}
      {erro && <p className="erro">{erro}</p>}

      <div className="cardapio-grid">
        {itens.map((item) => {
          const visual = visualCategoria(item.categoria);
          return (
            <article
              key={item.id}
              className={
                item.disponivel ? 'cardapio-item' : 'cardapio-item cardapio-item--indisponivel'
              }
            >
              <div
                className="cardapio-item__foto"
                style={{ background: visual.fundo }}
                aria-hidden="true"
              >
                {visual.emoji}
              </div>
              {!item.disponivel && <span className="selo-esgotado">Esgotado</span>}
              <div className="cardapio-item__corpo">
                <h2>{item.nome}</h2>
                <p>{item.disponivel ? item.descricao : 'Item indisponível no momento'}</p>
                <div className="cardapio-item__rodape">
                  <span className="preco">{formatarCentavos(item.precoCentavos)}</span>
                  <BotaoTouch
                    variante="primario"
                    onClick={() => adicionar(item)}
                    disabled={!item.disponivel}
                  >
                    {item.disponivel ? 'Adicionar' : 'Indisponível'}
                  </BotaoTouch>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="barra-carrinho">
        <BotaoTouch
          variante="destaque"
          onClick={() => irParaEtapa('carrinho')}
          disabled={quantidadeNoCarrinho === 0}
        >
          🛒 Ver carrinho ({quantidadeNoCarrinho})
        </BotaoTouch>
      </div>
    </div>
  );
}
