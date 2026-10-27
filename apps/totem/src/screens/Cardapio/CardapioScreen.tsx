import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ItemCardapio } from '@totem/shared';
import { adicionarItemCarrinho, buscarCardapio, urlImagem } from '../../services/apiClient';
import { useConfig } from '../../contexts/ConfigContext';
import { usePedido } from '../../contexts/PedidoContext';
import { useAvisoTemporario } from '../../hooks/useAvisoTemporario';
import { useFecharAoTocarFora } from '../../hooks/useFecharAoTocarFora';
import { BotaoTouch } from '../../components/BotaoTouch';
import { FotoItem, IconeCategoria } from '../../components/FotoItem';
import { ItemModal } from '../../components/ItemModal';
import { LeitorCodigo } from '../../components/LeitorCodigo';
import { TecladoVirtual } from '../../components/TecladoVirtual';
import { INTERVALO_ATUALIZACAO_CARDAPIO_MS } from '../../utils/atualizacaoCardapio';
import { formatarCentavos } from '../../utils/formatarMoeda';

// Tela 2 — Cardápio.
// US-01: Visualizar cardápio por categorias (abas no topo, à esquerda ou à direita,
// conforme o administrador; capa da categoria aberta, se houver).
// US-02: Buscar item pelo nome (filtro em tempo real, com teclado virtual).
// US-03: Tocar no item abre o detalhe, onde se escolhe a quantidade e adiciona.
// US 34 / item 7: enquanto está aberto, o cardápio se relê sozinho a cada 30 segundos,
// para o que o funcionário mudar (esgotado, preço, foto, descrição) chegar aos totens.
export function CardapioScreen() {
  const { aparencia, categorias, exibirTodos, posicaoCategorias } = useConfig();
  const [itens, setItens] = useState<ItemCardapio[]>([]);
  // Cardápio inteiro, para nomear os itens de um combo que estão em outras categorias.
  const [todos, setTodos] = useState<ItemCardapio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Sem a aba "Todos", o cardápio abre na primeira categoria.
  const [categoria, setCategoria] = useState<string | null>(
    exibirTodos ? null : (categorias[0]?.id ?? null),
  );
  const [busca, setBusca] = useState('');
  const [tecladoAberto, setTecladoAberto] = useState(false);
  const [itemAberto, setItemAberto] = useState<ItemCardapio | null>(null);
  const [leitorAberto, setLeitorAberto] = useState(false);
  const [atualizacao, setAtualizacao] = useState(0);
  const [aviso, mostrarAviso] = useAvisoTemporario();
  const buscaRef = useRef<HTMLDivElement>(null);
  const { pedidoId, pedido, recarregarPedido, irParaEtapa } = usePedido();

  // Fecha o teclado ao tocar fora da área de busca (campo + teclado); o texto digitado
  // permanece no campo e o teclado volta ao tocar nele de novo.
  const fecharTeclado = useCallback(() => setTecladoAberto(false), []);
  useFecharAoTocarFora(buscaRef, tecladoAberto, fecharTeclado);

  // US 34: relê o cardápio a cada 30 segundos enquanto esta tela estiver aberta.
  useEffect(() => {
    const intervalo = window.setInterval(
      () => setAtualizacao((atual) => atual + 1),
      INTERVALO_ATUALIZACAO_CARDAPIO_MS,
    );
    return () => window.clearInterval(intervalo);
  }, []);

  // Recarrega a lista a cada mudança de categoria/busca e a cada atualização periódica.
  // `cancelado` evita que uma resposta antiga sobrescreva a mais recente quando o
  // cliente digita rápido.
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
  }, [categoria, busca, atualizacao]);

  useEffect(() => {
    buscarCardapio()
      .then(setTodos)
      .catch(() => undefined);
  }, [atualizacao]);

  // O item aberto acompanha a releitura (pode ter esgotado ou mudado de preço).
  const itemAtual = itemAberto
    ? (itens.find((item) => item.id === itemAberto.id) ?? itemAberto)
    : null;
  const nomes = useMemo(() => new Map(todos.map((item) => [item.id, item.nome])), [todos]);

  // US-03: Adicionar ao carrinho
  async function adicionar(item: ItemCardapio, quantidade: number) {
    try {
      await adicionarItemCarrinho(pedidoId, {
        itemCardapioId: item.id,
        nome: item.nome,
        quantidade,
      });
      await recarregarPedido();
      setItemAberto(null);
      mostrarAviso(`${quantidade}× ${item.nome} no carrinho.`);
    } catch (err) {
      mostrarAviso((err as Error).message);
    }
  }

  const itensNoCarrinho = pedido?.itens ?? [];
  const quantidadeNoCarrinho = itensNoCarrinho.reduce((total, item) => total + item.quantidade, 0);
  const categoriaAberta = categorias.find((cat) => cat.id === categoria);
  const restanteDe = (item: ItemCardapio) => {
    const noCarrinho =
      itensNoCarrinho.find((linha) => linha.itemCardapioId === item.id)?.quantidade ?? 0;
    return item.estoque === undefined ? undefined : item.estoque - noCarrinho;
  };

  return (
    <div className="tela-cardapio">
      <div className={`cardapio cardapio--${posicaoCategorias}`}>
        <nav className="abas-categorias" aria-label="Categorias do cardápio">
          {exibirTodos && (
            <button
              type="button"
              className={
                categoria === null ? 'aba-categoria aba-categoria--ativa' : 'aba-categoria'
              }
              onClick={() => setCategoria(null)}
            >
              <span aria-hidden="true">🍽️</span>
              <span>Todos</span>
            </button>
          )}
          {categorias.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={
                categoria === cat.id ? 'aba-categoria aba-categoria--ativa' : 'aba-categoria'
              }
              onClick={() => setCategoria(cat.id)}
            >
              <IconeCategoria categoria={cat} />
              <span>{cat.nome}</span>
            </button>
          ))}
        </nav>

        <section className="cardapio__conteudo">
          {/* Item 8: foto de capa da categoria aberta. */}
          {categoriaAberta?.capaUrl && (
            <img className="cardapio__capa" src={urlImagem(categoriaAberta.capaUrl)} alt="" />
          )}
          <h1 className="tela__titulo">
            {categoriaAberta?.nome ?? aparencia.paginas.cardapio.titulo}
          </h1>
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
            </div>
            {tecladoAberto && <TecladoVirtual valor={busca} onChange={setBusca} />}
          </div>

          {carregando && <p className="aviso">Carregando cardápio...</p>}
          {erro && <p className="erro">{erro}</p>}
          {!carregando && !erro && itens.length === 0 && (
            <p className="aviso">
              {busca.trim() ? 'Nenhum item encontrado' : 'Nenhum item disponível nesta categoria'}
            </p>
          )}

          <div className="cardapio-grid">
            {itens.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  item.disponivel ? 'cardapio-item' : 'cardapio-item cardapio-item--indisponivel'
                }
                onClick={() => setItemAberto(item)}
              >
                <FotoItem item={item} categorias={categorias} className="cardapio-item__foto" />
                {!item.disponivel && <span className="selo-esgotado">Esgotado</span>}
                <span className="cardapio-item__nome">{item.nome}</span>
                {item.disponivel ? (
                  <span className="preco">{formatarCentavos(item.precoCentavos)}</span>
                ) : (
                  <span className="cardapio-item__indisponivel">Item indisponível no momento</span>
                )}
              </button>
            ))}
          </div>
        </section>
      </div>

      {aviso && (
        <p className="aviso-flutuante" role="status">
          {aviso}
        </p>
      )}

      <div className="barra-acoes">
        <BotaoTouch onClick={() => setLeitorAberto(true)}>📷 Câmera</BotaoTouch>
        <BotaoTouch
          variante="destaque"
          onClick={() => irParaEtapa('carrinho')}
          disabled={quantidadeNoCarrinho === 0}
        >
          🛒 Carrinho ({quantidadeNoCarrinho})
          {quantidadeNoCarrinho > 0 && ` · ${formatarCentavos(pedido?.valorTotalCentavos ?? 0)}`}
        </BotaoTouch>
        <BotaoTouch
          variante="primario"
          className="barra-acoes__finalizar"
          onClick={() => irParaEtapa('pagamento')}
          disabled={quantidadeNoCarrinho === 0}
        >
          Finalizar
        </BotaoTouch>
      </div>

      {itemAtual && (
        <ItemModal
          key={itemAtual.id}
          item={itemAtual}
          categorias={categorias}
          nomeDoItem={(id) => nomes.get(id) ?? 'item'}
          restante={restanteDe(itemAtual)}
          aoAdicionar={(quantidade) => adicionar(itemAtual, quantidade)}
          aoTocarNoLimite={() =>
            mostrarAviso(`Quantidade máxima atingida: não há mais unidades de ${itemAtual.nome}.`)
          }
          aoFechar={() => setItemAberto(null)}
        />
      )}
      {leitorAberto && (
        <LeitorCodigo aoFechar={() => setLeitorAberto(false)} aoResultado={mostrarAviso} />
      )}
    </div>
  );
}
