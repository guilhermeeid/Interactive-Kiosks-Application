import { useEffect, useRef, useState } from 'react';
import type { ItemCardapio } from '@totem/shared';
import { adicionarItemCarrinho, buscarCardapio } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';
import { BotaoTouch } from '../../components/BotaoTouch';
import { TecladoVirtual } from '../../components/TecladoVirtual';
import { formatarCentavos } from '../../utils/formatarMoeda';
import { CATEGORIAS, visualCategoria } from '../../utils/visualCategoria';

// US-01: Visualizar cardápio por categorias.
// US-02: Buscar item pelo nome (filtro em tempo real, com teclado virtual).
export function CardapioScreen() {
  const [itens, setItens] = useState<ItemCardapio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [tecladoAberto, setTecladoAberto] = useState(false);
  const buscaRef = useRef<HTMLDivElement>(null);
  const { pedidoId, pedido, recarregarPedido, irParaEtapa } = usePedido();

  // Fecha o teclado ao tocar fora da área de busca (campo + teclado); o texto digitado
  // permanece no campo e o teclado volta ao tocar nele de novo.
  useEffect(() => {
    if (!tecladoAberto) return;
    function aoTocar(evento: PointerEvent) {
      if (!buscaRef.current?.contains(evento.target as Node)) {
        setTecladoAberto(false);
      }
    }
    document.addEventListener('pointerdown', aoTocar);
    return () => document.removeEventListener('pointerdown', aoTocar);
  }, [tecladoAberto]);

  // Recarrega a lista a cada mudança de categoria/busca. `cancelado` evita que uma
  // resposta antiga sobrescreva a mais recente quando o cliente digita rápido.
  useEffect(() => {
    let cancelado = false;
    buscarCardapio({ categoria: categoria ?? undefined, busca })
      .then((resultado) => {
        if (!cancelado) {
          setItens(resultado);
          setErro(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelado) setErro(err.message);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [categoria, busca]);

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

      <div className="busca" ref={buscaRef}>
        <div className="busca__campo">
          <input
            type="text"
            readOnly
            value={busca}
            placeholder="🔍 Buscar item pelo nome"
            aria-label="Buscar item pelo nome"
            onClick={() => setTecladoAberto(true)}
            onFocus={() => setTecladoAberto(true)}
          />
          {busca && (
            <BotaoTouch variante="perigo" onClick={() => setBusca('')}>
              Limpar
            </BotaoTouch>
          )}
          {tecladoAberto && (
            <BotaoTouch variante="primario" onClick={() => setTecladoAberto(false)}>
              Fechar teclado
            </BotaoTouch>
          )}
        </div>
        {tecladoAberto && <TecladoVirtual valor={busca} onChange={setBusca} />}
      </div>

      <div className="categorias" role="tablist" aria-label="Categorias do cardápio">
        <BotaoTouch
          variante={categoria === null ? 'destaque' : 'padrao'}
          onClick={() => setCategoria(null)}
        >
          Todos
        </BotaoTouch>
        {CATEGORIAS.map((cat) => (
          <BotaoTouch
            key={cat.id}
            variante={categoria === cat.id ? 'destaque' : 'padrao'}
            onClick={() => setCategoria(cat.id)}
          >
            {visualCategoria(cat.id).emoji} {cat.nome}
          </BotaoTouch>
        ))}
      </div>

      {carregando && <p className="aviso">Carregando cardápio...</p>}
      {erro && <p className="erro">{erro}</p>}
      {!carregando && !erro && itens.length === 0 && (
        <p className="aviso">
          {busca.trim() ? 'Nenhum item encontrado' : 'Nenhum item disponível nesta categoria'}
        </p>
      )}

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
