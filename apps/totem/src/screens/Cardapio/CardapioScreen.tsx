import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemCardapio } from '@totem/shared';
import { adicionarItemCarrinho, buscarCardapio, urlImagem } from '../../services/apiClient';
import { useConfig } from '../../contexts/ConfigContext';
import { usePedido } from '../../contexts/PedidoContext';
import { useAvisoTemporario } from '../../hooks/useAvisoTemporario';
import { useFecharAoTocarFora } from '../../hooks/useFecharAoTocarFora';
import { BotaoTouch } from '../../components/BotaoTouch';
import { SeletorQuantidade } from '../../components/SeletorQuantidade';
import { TecladoVirtual } from '../../components/TecladoVirtual';
import { formatarCentavos } from '../../utils/formatarMoeda';
import { visualItem } from '../../utils/visualCategoria';

// US-01: Visualizar cardápio por categorias.
// US-02: Buscar item pelo nome (filtro em tempo real, com teclado virtual).
// US-03: Escolher a quantidade e adicionar ao carrinho.
export function CardapioScreen() {
  const { aparencia, categorias, exibirTodos } = useConfig();
  const [itens, setItens] = useState<ItemCardapio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Sem a aba "Todos", o cardápio abre na primeira categoria.
  const [categoria, setCategoria] = useState<string | null>(
    exibirTodos ? null : (categorias[0]?.id ?? null),
  );
  const [busca, setBusca] = useState('');
  const [tecladoAberto, setTecladoAberto] = useState(false);
  // Quantidade escolhida em cada card antes de adicionar (padrão: 1).
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [aviso, mostrarAviso] = useAvisoTemporario();
  const buscaRef = useRef<HTMLDivElement>(null);
  const { pedidoId, pedido, recarregarPedido, irParaEtapa } = usePedido();

  // Fecha o teclado ao tocar fora da área de busca (campo + teclado); o texto digitado
  // permanece no campo e o teclado volta ao tocar nele de novo.
  const fecharTeclado = useCallback(() => setTecladoAberto(false), []);
  useFecharAoTocarFora(buscaRef, tecladoAberto, fecharTeclado);

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

  function definirQuantidade(itemId: string, quantidade: number) {
    setQuantidades((atuais) => ({ ...atuais, [itemId]: quantidade }));
  }

  // US-03: Adicionar ao carrinho
  async function adicionar(item: ItemCardapio, quantidade: number) {
    try {
      await adicionarItemCarrinho(pedidoId, {
        itemCardapioId: item.id,
        nome: item.nome,
        quantidade,
      });
      await recarregarPedido();
      definirQuantidade(item.id, 1);
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const itensNoCarrinho = pedido?.itens ?? [];
  const quantidadeNoCarrinho = itensNoCarrinho.reduce((total, item) => total + item.quantidade, 0);

  return (
    <div className="tela">
      <h1 className="tela__titulo">{aparencia.paginas.cardapio.titulo}</h1>
      <p className="tela__subtitulo">{aparencia.paginas.cardapio.descricao}</p>

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
        {exibirTodos && (
          <BotaoTouch
            variante={categoria === null ? 'destaque' : 'padrao'}
            onClick={() => setCategoria(null)}
          >
            Todos
          </BotaoTouch>
        )}
        {categorias.map((cat) => (
          <BotaoTouch
            key={cat.id}
            variante={categoria === cat.id ? 'destaque' : 'padrao'}
            onClick={() => setCategoria(cat.id)}
          >
            {cat.icone} {cat.nome}
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
          const visual = visualItem(item, categorias);
          const noCarrinho =
            itensNoCarrinho.find((i) => i.itemCardapioId === item.id)?.quantidade ?? 0;
          // Com controle de estoque, o cliente só escolhe o que ainda não pôs no carrinho.
          const restante = item.estoque === undefined ? undefined : item.estoque - noCarrinho;
          const limiteNoCarrinho = item.disponivel && restante !== undefined && restante <= 0;
          const quantidade = Math.min(quantidades[item.id] ?? 1, restante ?? Infinity);
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
                {item.imagemUrl ? <img src={urlImagem(item.imagemUrl)} alt="" /> : visual.icone}
              </div>
              {!item.disponivel && <span className="selo-esgotado">Esgotado</span>}
              <div className="cardapio-item__corpo">
                <h2>{item.nome}</h2>
                <p>{item.disponivel ? item.descricao : 'Item indisponível no momento'}</p>
                <div className="cardapio-item__rodape">
                  <span className="preco">{formatarCentavos(item.precoCentavos)}</span>
                  {item.disponivel && !limiteNoCarrinho && (
                    <SeletorQuantidade
                      valor={quantidade}
                      nomeItem={item.nome}
                      minimo={1}
                      maximo={restante}
                      aoMudar={(nova) => definirQuantidade(item.id, nova)}
                      aoTocarNoLimite={() =>
                        mostrarAviso(`Quantidade máxima atingida: não há mais unidades de ${item.nome}.`)
                      }
                    />
                  )}
                </div>
                <BotaoTouch
                  variante="primario"
                  onClick={() => adicionar(item, quantidade)}
                  disabled={!item.disponivel || limiteNoCarrinho}
                >
                  {!item.disponivel
                    ? 'Indisponível'
                    : limiteNoCarrinho
                      ? 'Máximo no carrinho'
                      : 'Adicionar'}
                </BotaoTouch>
              </div>
            </article>
          );
        })}
      </div>

      {aviso && (
        <p className="aviso-flutuante" role="status">
          {aviso}
        </p>
      )}

      <div className="barra-carrinho">
        <BotaoTouch
          variante="destaque"
          onClick={() => irParaEtapa('carrinho')}
          disabled={quantidadeNoCarrinho === 0}
        >
          🛒 Ver carrinho ({quantidadeNoCarrinho})
          {quantidadeNoCarrinho > 0 && ` · ${formatarCentavos(pedido?.valorTotalCentavos ?? 0)}`}
        </BotaoTouch>
      </div>
    </div>
  );
}
