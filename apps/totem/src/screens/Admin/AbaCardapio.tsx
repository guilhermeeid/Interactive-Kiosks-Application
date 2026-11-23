import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CategoriaCardapio,
  ComPendencia,
  ItemCardapio,
  PosicaoCategorias,
} from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { FotoItem, IconeCategoria } from '../../components/FotoItem';
import type { DadosProduto } from '../../services/adminApi';
import { ErroApi, urlImagem } from '../../services/apiClient';
import { PRAZO_ATUALIZACAO_CARDAPIO } from '../../utils/atualizacaoCardapio';
import { centavosParaReais, formatarCentavos, reaisParaCentavos } from '../../utils/formatarMoeda';
import {
  Campo,
  CampoImagem,
  MensagemRetorno,
  Opcao,
  SALVO_PENDENTE,
  SeloPendente,
  VALE_NA_HORA,
  useAcao,
  type PropsAba,
} from './comum';

// Lado máximo das imagens enviadas. A foto do item aparece no card e no detalhe; a capa
// ocupa a largura da tela de pé (1080px); o ícone da categoria fica pequeno na aba.
const LADO_FOTO = 640;
const LADO_CAPA = 1080;
const LADO_ICONE = 192;

const POSICOES: { valor: PosicaoCategorias; rotulo: string; dica: string }[] = [
  { valor: 'topo', rotulo: 'No topo', dica: 'Abas lado a lado acima dos produtos.' },
  { valor: 'esquerda', rotulo: 'À esquerda', dica: 'Coluna de categorias à esquerda.' },
  { valor: 'direita', rotulo: 'À direita', dica: 'Coluna de categorias à direita.' },
];

export function AbaCardapio(props: PropsAba) {
  return (
    <>
      <SecaoCategorias {...props} />
      <SecaoProdutos {...props} />
    </>
  );
}

// ---------- Categorias ----------

// Categorias novas ganham um id provisório; o servidor gera o definitivo ao salvar.
const PREFIXO_NOVA = 'nova-';

function moverNaLista<T>(lista: T[], de: number, para: number): T[] {
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

// Arrastar e soltar pela alça (⠿), com mouse ou toque: o destino é a linha sob o dedo.
function useArrastarCategorias(aoSoltar: (de: number, para: number) => void) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [destino, setDestino] = useState<number | null>(null);

  const linhaSob = (x: number, y: number): number | null => {
    const linha = document.elementFromPoint(x, y)?.closest('[data-indice-categoria]');
    const indice = linha?.getAttribute('data-indice-categoria');
    return indice === null || indice === undefined ? null : Number(indice);
  };

  const propsAlca = (indice: number) => ({
    onPointerDown: (evento: React.PointerEvent<HTMLElement>) => {
      evento.preventDefault();
      evento.currentTarget.setPointerCapture(evento.pointerId);
      setArrastando(indice);
      setDestino(indice);
    },
    onPointerMove: (evento: React.PointerEvent<HTMLElement>) => {
      if (arrastando === null) return;
      const sob = linhaSob(evento.clientX, evento.clientY);
      if (sob !== null) setDestino(sob);
    },
    onPointerUp: () => {
      if (arrastando !== null && destino !== null && destino !== arrastando) {
        aoSoltar(arrastando, destino);
      }
      setArrastando(null);
      setDestino(null);
    },
    onPointerCancel: () => {
      setArrastando(null);
      setDestino(null);
    },
  });

  return { arrastando, destino, propsAlca };
}

function SecaoCategorias({ api, config, salvarConfig, aoMudarConfig }: PropsAba) {
  const [categorias, setCategorias] = useState<CategoriaCardapio[]>(config.categorias);
  const [exibirTodos, setExibirTodos] = useState(config.exibirTodos);
  const [posicao, setPosicao] = useState<PosicaoCategorias>(config.posicaoCategorias);
  const { retorno, ocupado, executar } = useAcao();
  const proximaNova = useRef(1);

  const alterar = (indice: number, parcial: Partial<CategoriaCardapio>) =>
    setCategorias((atuais) => atuais.map((c, i) => (i === indice ? { ...c, ...parcial } : c)));

  // Ordem e ativação valem na hora (os totens veem em até 30 segundos), sem esperar o
  // reinício; o que mais estiver sendo editado na lista continua só na tela até "Salvar".
  // Desativar uma categoria com itens: o servidor pede confirmação explícita.
  const organizar = (nova: CategoriaCardapio[], sucesso: string) => {
    const anterior = categorias;
    setCategorias(nova);
    const ordem = nova.map((categoria) => categoria.id);
    const inativas = nova.filter((c) => c.ativa === false).map((categoria) => categoria.id);
    return executar(async () => {
      try {
        let salva;
        try {
          salva = await api.organizarCategorias(ordem, inativas);
        } catch (err) {
          if (!(err instanceof ErroApi) || err.codigo !== 'CONFIRMAR_DESATIVACAO') throw err;
          if (!window.confirm(err.message)) {
            throw new Error('Nada mudou: a categoria continua ativa.');
          }
          salva = await api.organizarCategorias(ordem, inativas, true);
        }
        aoMudarConfig(salva);
      } catch (err) {
        setCategorias(anterior);
        throw err;
      }
    }, sucesso);
  };

  const mover = (de: number, para: number) => {
    if (para < 0 || para >= categorias.length || de === para) return;
    organizar(
      moverNaLista(categorias, de, para),
      `Nova ordem em vigor: os totens atualizam em até ${PRAZO_ATUALIZACAO_CARDAPIO}.`,
    );
  };
  const { arrastando, destino, propsAlca } = useArrastarCategorias(mover);

  const alternarAtiva = (indice: number) => {
    const categoria = categorias[indice];
    const ativar = categoria.ativa === false;
    organizar(
      categorias.map((c, i) => (i === indice ? { ...c, ativa: ativar ? undefined : false } : c)),
      ativar
        ? `"${categoria.nome}" reativada: volta aos totens em até ${PRAZO_ATUALIZACAO_CARDAPIO}.`
        : `"${categoria.nome}" desativada: sai dos totens em até ${PRAZO_ATUALIZACAO_CARDAPIO}.`,
    );
  };

  const salvar = () =>
    executar(async () => {
      const salva = await salvarConfig({
        ...config,
        categorias,
        exibirTodos,
        posicaoCategorias: posicao,
      });
      setCategorias(salva.categorias);
    }, `Categorias salvas. ${SALVO_PENDENTE}`);

  return (
    <form
      className="admin-secao"
      onSubmit={(evento) => {
        evento.preventDefault();
        salvar();
      }}
    >
      <h2>Categorias</h2>

      {/* Item 5: onde as categorias ficam na tela do cardápio. */}
      <fieldset className="admin-escolha">
        <legend className="admin-campo__rotulo">Posição das categorias no totem</legend>
        {POSICOES.map((opcao) => (
          <label key={opcao.valor} className="admin-opcao">
            <input
              type="radio"
              name="posicao-categorias"
              checked={posicao === opcao.valor}
              onChange={() => setPosicao(opcao.valor)}
            />
            <span>
              <strong>{opcao.rotulo}</strong>
              <small>{opcao.dica}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="admin-dica">
        A ordem daqui é a ordem das abas no totem: arraste pela alça ⠿ (ou use ↑ ↓). Ordem e
        ativação valem na hora; nome, ícone, capa, categorias novas e removidas entram em vigor no
        reinício. Item 8: o ícone aparece na aba; a capa aparece no alto da lista quando a
        categoria é escolhida.
      </p>
      <div className="admin-lista">
        {categorias.map((categoria, indice) => (
          <div
            key={categoria.id}
            data-indice-categoria={indice}
            className={[
              'admin-linha admin-linha--categoria',
              arrastando === indice && 'admin-linha--arrastando',
              arrastando !== null && destino === indice && arrastando !== indice && 'admin-linha--destino',
              categoria.ativa === false && 'admin-linha--desativada',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span
              className="admin-alca"
              role="button"
              aria-label={`Arrastar ${categoria.nome} para mudar a ordem`}
              title="Arraste para mudar a ordem"
              {...(categoria.id.startsWith(PREFIXO_NOVA) || ocupado ? {} : propsAlca(indice))}
            >
              ⠿
            </span>
            <span className="admin-miniatura" aria-hidden="true">
              <IconeCategoria categoria={categoria} />
            </span>
            <div className="admin-grade">
              <Campo rotulo="Nome">
                <input
                  type="text"
                  value={categoria.nome}
                  maxLength={30}
                  onChange={(evento) => alterar(indice, { nome: evento.target.value })}
                />
              </Campo>
              <Campo rotulo="Ícone (emoji)" dica="Usado quando não há imagem de ícone.">
                <input
                  type="text"
                  value={categoria.icone ?? ''}
                  maxLength={8}
                  onChange={(evento) => alterar(indice, { icone: evento.target.value })}
                />
              </Campo>
            </div>
            <div className="admin-linha__acoes">
              <BotaoTouch
                aria-label={`Subir ${categoria.nome}`}
                onClick={() => mover(indice, indice - 1)}
                disabled={indice === 0 || ocupado}
              >
                ↑
              </BotaoTouch>
              <BotaoTouch
                aria-label={`Descer ${categoria.nome}`}
                onClick={() => mover(indice, indice + 1)}
                disabled={indice === categorias.length - 1 || ocupado}
              >
                ↓
              </BotaoTouch>
              {!categoria.id.startsWith(PREFIXO_NOVA) && (
                <BotaoTouch
                  variante={categoria.ativa === false ? 'destaque' : 'padrao'}
                  onClick={() => alternarAtiva(indice)}
                  disabled={ocupado}
                >
                  {categoria.ativa === false ? 'Reativar' : 'Desativar'}
                </BotaoTouch>
              )}
              <BotaoTouch
                variante="perigo"
                onClick={() => setCategorias((atuais) => atuais.filter((_, i) => i !== indice))}
              >
                Remover
              </BotaoTouch>
            </div>

            <div className="admin-categoria-imagens">
              <div className="admin-logo">
                <CampoImagem
                  rotulo="Imagem do ícone"
                  dica="Quadrada, fundo transparente fica melhor."
                  ladoMaximo={LADO_ICONE}
                  enviarImagem={api.enviarImagem}
                  executar={executar}
                  aoEnviar={(url) => alterar(indice, { iconeImagemUrl: url })}
                  aoRemover={
                    categoria.iconeImagemUrl
                      ? () => alterar(indice, { iconeImagemUrl: undefined })
                      : undefined
                  }
                  rotuloRemover="Voltar ao emoji"
                />
              </div>
              <div className="admin-logo">
                {categoria.capaUrl && (
                  <img className="admin-capa" src={urlImagem(categoria.capaUrl)} alt="" />
                )}
                <CampoImagem
                  rotulo="Foto de capa"
                  dica="Faixa larga (ex.: 1080×400) no alto da categoria."
                  ladoMaximo={LADO_CAPA}
                  enviarImagem={api.enviarImagem}
                  executar={executar}
                  aoEnviar={(url) => alterar(indice, { capaUrl: url })}
                  aoRemover={
                    categoria.capaUrl ? () => alterar(indice, { capaUrl: undefined }) : undefined
                  }
                  rotuloRemover="Tirar a capa"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <BotaoTouch
        onClick={() =>
          setCategorias((atuais) => [
            ...atuais,
            { id: `${PREFIXO_NOVA}${proximaNova.current++}`, nome: '', icone: '' },
          ])
        }
      >
        + Nova categoria
      </BotaoTouch>

      <Opcao
        rotulo='Exibir a aba "Todos"'
        dica="Uma página só com todos os itens, na ordem das categorias. Desmarcada, o totem mostra apenas uma categoria por vez."
        marcado={exibirTodos}
        aoMudar={setExibirTodos}
      />

      <MensagemRetorno retorno={retorno} />
      <BotaoTouch type="submit" variante="primario" disabled={ocupado}>
        Salvar categorias
      </BotaoTouch>
    </form>
  );
}

// ---------- Produtos e combos ----------

interface FormComponente {
  itemCardapioId: string;
  quantidade: string;
}

// Campos do formulário de produto, como texto digitado; viram DadosProduto ao salvar.
interface FormProduto {
  id: string | null; // null = produto novo
  nome: string;
  descricao: string;
  categoria: string;
  preco: string;
  icone: string;
  imagemUrl: string | null;
  estoque: string; // vazio = sem controle de quantidade
  disponivel: boolean;
  componentes: FormComponente[] | null; // presente = combo
}

// O produto como estava quando o formulário abriu (para mandar só o que mudou).
interface Edicao {
  form: FormProduto;
  original: DadosProduto | null;
}

function formVazio(categoria: string, combo: boolean): FormProduto {
  return {
    id: null,
    nome: '',
    descricao: '',
    categoria,
    preco: '',
    icone: '',
    imagemUrl: null,
    estoque: '',
    disponivel: true,
    componentes: combo ? [{ itemCardapioId: '', quantidade: '1' }] : null,
  };
}

function formDoProduto(produto: ItemCardapio): FormProduto {
  return {
    id: produto.id,
    nome: produto.nome,
    descricao: produto.descricao,
    categoria: produto.categoria,
    preco: centavosParaReais(produto.precoCentavos),
    icone: produto.icone ?? '',
    imagemUrl: produto.imagemUrl ?? null,
    estoque: produto.estoque === undefined ? '' : String(produto.estoque),
    disponivel: produto.disponivel,
    componentes:
      produto.componentes?.map((parte) => ({
        itemCardapioId: parte.itemCardapioId,
        quantidade: String(parte.quantidade),
      })) ?? null,
  };
}

function dadosDoProduto(produto: ItemCardapio): DadosProduto {
  return {
    nome: produto.nome,
    descricao: produto.descricao,
    categoria: produto.categoria,
    precoCentavos: produto.precoCentavos,
    icone: produto.icone ?? null,
    imagemUrl: produto.imagemUrl ?? null,
    estoque: produto.estoque ?? null,
    disponivel: produto.disponivel,
    componentes: produto.componentes ?? null,
  };
}

function dadosDoForm(form: FormProduto): DadosProduto {
  const precoCentavos = reaisParaCentavos(form.preco);
  if (precoCentavos === null) {
    throw new Error('Informe o preço em reais, como 18,90');
  }
  const estoque = form.estoque.trim();
  if (!form.componentes && estoque && !/^\d+$/.test(estoque)) {
    throw new Error('A quantidade deve ser um número inteiro (ou vazia, para não controlar)');
  }
  const componentes =
    form.componentes?.map((parte) => {
      if (!parte.itemCardapioId) {
        throw new Error('Escolha o item de cada linha do combo (ou tire a linha)');
      }
      if (!/^\d+$/.test(parte.quantidade.trim())) {
        throw new Error('A quantidade de cada item do combo deve ser um número inteiro');
      }
      return { itemCardapioId: parte.itemCardapioId, quantidade: Number(parte.quantidade) };
    }) ?? null;
  return {
    nome: form.nome,
    descricao: form.descricao,
    categoria: form.categoria,
    precoCentavos,
    icone: form.icone.trim() || null,
    imagemUrl: form.imagemUrl,
    // O estoque de um combo vem dos itens que o compõem.
    estoque: !componentes && estoque ? Number(estoque) : null,
    disponivel: form.disponivel,
    componentes,
  };
}

// Campos que o administrador mexeu no formulário.
function camposMudados(editado: DadosProduto, original: DadosProduto): (keyof DadosProduto)[] {
  return (Object.keys(editado) as (keyof DadosProduto)[]).filter(
    (campo) => JSON.stringify(editado[campo]) !== JSON.stringify(original[campo]),
  );
}

// O formulário manda o produto inteiro. Para não desfazer o que mudou enquanto ele
// estava aberto (vendas baixando o estoque, o funcionário marcando como esgotado ou
// trocando o preço), só os campos que o administrador mexeu saem do formulário; os
// demais vêm do produto como está agora.
function soOQueMudou(
  editado: DadosProduto,
  original: DadosProduto,
  agora: DadosProduto,
): DadosProduto {
  const resultado = { ...agora } as Record<keyof DadosProduto, unknown>;
  for (const campo of camposMudados(editado, original)) {
    resultado[campo] = editado[campo];
  }
  return resultado as unknown as DadosProduto;
}

// US 34: num produto que já está à venda, estes campos valem na hora; os outros (nome,
// categoria, ícone, itens do combo) entram em vigor quando o servidor reinicia.
const CAMPOS_NA_HORA: (keyof DadosProduto)[] = [
  'precoCentavos',
  'imagemUrl',
  'descricao',
  'estoque',
  'disponivel',
];

function mensagemDaEdicao(mudados: (keyof DadosProduto)[]): string {
  const naHora = mudados.filter((campo) => CAMPOS_NA_HORA.includes(campo));
  if (mudados.length === 0) return 'Nada mudou.';
  if (naHora.length === mudados.length) return `Produto salvo. ${VALE_NA_HORA}`;
  if (naHora.length === 0) return `Produto salvo. ${SALVO_PENDENTE}`;
  return 'Produto salvo. Preço, foto, descrição, quantidade e disponibilidade já valem (os totens atualizam em até 30 segundos); o resto entra em vigor quando o servidor for reiniciado.';
}

function SecaoProdutos({ api, config, aoSalvar }: PropsAba) {
  const [produtos, setProdutos] = useState<ComPendencia<ItemCardapio>[]>([]);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const { retorno, ocupado, executar } = useAcao();
  const { categorias } = config;
  const form = edicao?.form ?? null;
  // O formulário abre no lugar do item editado (ou no topo, para um produto novo) e a
  // tela rola até ele: numa lista longa, ele poderia abrir fora da vista.
  const formRef = useRef<HTMLFormElement>(null);
  const abertoEm = edicao ? (edicao.form.id ?? 'novo') : null;
  useEffect(() => {
    if (!abertoEm) return;
    formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    formRef.current?.querySelector('input')?.focus({ preventScroll: true });
  }, [abertoEm]);

  const carregar = useCallback(
    () => executar(async () => setProdutos(await api.listarProdutos())),
    [api, executar],
  );
  useEffect(() => {
    carregar();
  }, [carregar]);

  const alterar = (parcial: Partial<FormProduto>) =>
    setEdicao((atual) => (atual ? { ...atual, form: { ...atual.form, ...parcial } } : atual));

  const alterarComponente = (indice: number, parcial: Partial<FormComponente>) =>
    alterar({
      componentes: form?.componentes?.map((parte, i) =>
        i === indice ? { ...parte, ...parcial } : parte,
      ),
    });

  const abrir = (produto: ItemCardapio) =>
    setEdicao({ form: formDoProduto(produto), original: dadosDoProduto(produto) });

  async function salvar({ form: atual, original }: Edicao) {
    let mensagem = `Produto criado. ${SALVO_PENDENTE}`;
    const salvou = await executar(
      async () => {
        let dados = dadosDoForm(atual);
        // Produto que ainda não está à venda (novo, pendente) fica todo pendente.
        const agora = atual.id
          ? (await api.listarProdutos()).find((produto) => produto.id === atual.id)
          : undefined;
        if (agora && original) {
          dados = soOQueMudou(dados, original, dadosDoProduto(agora));
          if (agora.pendente !== 'novo') {
            mensagem = mensagemDaEdicao(camposMudados(dadosDoForm(atual), original));
          }
        }
        await (atual.id ? api.atualizarProduto(atual.id, dados) : api.criarProduto(dados));
        setProdutos(await api.listarProdutos());
        aoSalvar();
      },
      () => mensagem,
    );
    if (salvou) setEdicao(null);
  }

  const remover = (produto: ItemCardapio) =>
    window.confirm(`Remover "${produto.nome}" do cardápio no próximo reinício?`) &&
    executar(async () => {
      await api.removerProduto(produto.id);
      setProdutos(await api.listarProdutos());
      aoSalvar();
    }, `"${produto.nome}" sai do cardápio no reinício.`);

  const nomeCategoria = (id: string) => categorias.find((c) => c.id === id)?.nome ?? '—';
  const nomeProduto = (id: string) => produtos.find((p) => p.id === id)?.nome ?? '?';

  // Item 13: entram num combo os itens que ficam depois do reinício e não são combos.
  const candidatosCombo = produtos.filter(
    (produto) => !produto.componentes && produto.pendente !== 'removido' && produto.id !== form?.id,
  );
  const precoSeparados =
    form?.componentes?.reduce((total, parte) => {
      const item = produtos.find((produto) => produto.id === parte.itemCardapioId);
      return total + (item ? item.precoCentavos * (Number(parte.quantidade) || 0) : 0);
    }, 0) ?? 0;

  function descricaoEstoque(produto: ItemCardapio): string {
    if (produto.componentes) {
      return `combo: ${produto.componentes
        .map((parte) => `${parte.quantidade}× ${nomeProduto(parte.itemCardapioId)}`)
        .join(' + ')}`;
    }
    return produto.estoque === undefined
      ? 'sem controle de quantidade'
      : `${produto.estoque} à venda`;
  }

  const formulario = form && edicao && (
    <form
      ref={formRef}
      className="admin-form"
      onSubmit={(evento) => {
        evento.preventDefault();
        salvar(edicao);
      }}
    >
      <h3>{form.id ? `Editar ${form.nome}` : form.componentes ? 'Novo combo' : 'Novo produto'}</h3>
      <div className="admin-grade">
        <Campo rotulo="Nome">
          <input
            type="text"
            value={form.nome}
            maxLength={60}
            onChange={(evento) => alterar({ nome: evento.target.value })}
          />
        </Campo>
        <Campo rotulo="Categoria">
          <select
            value={form.categoria}
            onChange={(evento) => alterar({ categoria: evento.target.value })}
          >
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          rotulo="Preço (R$)"
          dica={
            form.componentes && precoSeparados > 0
              ? `Separados, os itens custam ${formatarCentavos(precoSeparados)}.`
              : undefined
          }
        >
          <input
            type="text"
            inputMode="decimal"
            placeholder="18,90"
            value={form.preco}
            onChange={(evento) => alterar({ preco: evento.target.value })}
          />
        </Campo>
        {!form.componentes && (
          <Campo
            rotulo="Quantidade à venda"
            dica="Vazio = sem controle. Com número, o item esgota sozinho quando as unidades acabam."
          >
            <input
              type="text"
              inputMode="numeric"
              value={form.estoque}
              onChange={(evento) => alterar({ estoque: evento.target.value })}
            />
          </Campo>
        )}
      </div>
      <Campo rotulo="Descrição">
        <input
          type="text"
          value={form.descricao}
          maxLength={200}
          onChange={(evento) => alterar({ descricao: evento.target.value })}
        />
      </Campo>

      {form.componentes && (
        <fieldset className="admin-combo">
          <legend className="admin-campo__rotulo">Itens do combo</legend>
          <p className="admin-dica">
            O combo não tem quantidade própria: ele esgota assim que qualquer item dele acabar.
          </p>
          {form.componentes.map((parte, indice) => (
            <div key={indice} className="admin-combo__linha">
              <select
                value={parte.itemCardapioId}
                aria-label={`Item ${indice + 1} do combo`}
                onChange={(evento) =>
                  alterarComponente(indice, { itemCardapioId: evento.target.value })
                }
              >
                <option value="">Escolha um item</option>
                {candidatosCombo.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome}
                  </option>
                ))}
              </select>
              <input
                type="text"
                inputMode="numeric"
                aria-label={`Quantidade do item ${indice + 1}`}
                value={parte.quantidade}
                onChange={(evento) =>
                  alterarComponente(indice, { quantidade: evento.target.value })
                }
              />
              <BotaoTouch
                variante="perigo"
                aria-label={`Tirar o item ${indice + 1} do combo`}
                onClick={() =>
                  alterar({ componentes: form.componentes?.filter((_, i) => i !== indice) })
                }
                disabled={form.componentes!.length === 1}
              >
                ✕
              </BotaoTouch>
            </div>
          ))}
          <BotaoTouch
            onClick={() =>
              alterar({
                componentes: [...(form.componentes ?? []), { itemCardapioId: '', quantidade: '1' }],
              })
            }
            disabled={form.componentes.length >= 10}
          >
            + Item no combo
          </BotaoTouch>
        </fieldset>
      )}

      <div className="admin-logo">
        <span className="admin-miniatura" aria-hidden="true">
          {form.imagemUrl ? <img src={urlImagem(form.imagemUrl)} alt="" /> : form.icone || '🍽️'}
        </span>
        <Campo rotulo="Ícone/emoji" dica="Usado quando não há foto.">
          <input
            type="text"
            value={form.icone}
            maxLength={8}
            onChange={(evento) => alterar({ icone: evento.target.value })}
          />
        </Campo>
        <CampoImagem
          rotulo="Foto"
          ladoMaximo={LADO_FOTO}
          enviarImagem={api.enviarImagem}
          executar={executar}
          aoEnviar={(url) => alterar({ imagemUrl: url })}
          aoRemover={form.imagemUrl ? () => alterar({ imagemUrl: null }) : undefined}
          rotuloRemover="Tirar a foto"
        />
      </div>

      <Opcao
        rotulo="Disponível para venda"
        dica='Desmarcado, o item aparece como "Esgotado" e sai de venda.'
        marcado={form.disponivel}
        aoMudar={(disponivel) => alterar({ disponivel })}
      />

      <div className="admin-linha__acoes">
        <BotaoTouch type="submit" variante="primario" disabled={ocupado}>
          Salvar
        </BotaoTouch>
        <BotaoTouch onClick={() => setEdicao(null)}>Cancelar</BotaoTouch>
      </div>
    </form>
  );

  return (
    <section className="admin-secao">
      <h2>Produtos e combos</h2>
      <p className="admin-dica">
        Preço, foto, descrição, quantidade e disponibilidade valem na hora: os totens atualizam o
        cardápio em até 30 segundos. Nome, categoria, ícone, itens do combo, produtos novos e
        remoções entram em vigor quando o servidor for reiniciado.
      </p>
      <MensagemRetorno retorno={retorno} />

      {form && edicao && !form.id && formulario}
      {!form && (
        <div className="admin-linha__acoes">
          <BotaoTouch
            variante="primario"
            onClick={() => setEdicao({ form: formVazio(categorias[0].id, false), original: null })}
          >
            + Novo produto
          </BotaoTouch>
          <BotaoTouch
            variante="primario"
            onClick={() => setEdicao({ form: formVazio(categorias[0].id, true), original: null })}
            disabled={candidatosCombo.length === 0}
          >
            + Novo combo
          </BotaoTouch>
        </div>
      )}

      <div className="admin-lista">
        {produtos.map((produto) => {
          if (form?.id === produto.id) {
            return <div key={produto.id}>{formulario}</div>;
          }
          const sai = produto.pendente === 'removido';
          return (
            <div
              key={produto.id}
              className={`admin-linha admin-linha--produto${sai ? ' admin-linha--sai' : ''}`}
            >
              <FotoItem item={produto} categorias={categorias} className="admin-miniatura" />
              <div>
                <strong>{produto.nome}</strong>
                <small>
                  {nomeCategoria(produto.categoria)} · {formatarCentavos(produto.precoCentavos)}
                  {' · '}
                  {descricaoEstoque(produto)}
                  {!produto.disponivel && ' · esgotado'}
                </small>
                <SeloPendente pendente={produto.pendente} />
              </div>
              <div className="admin-linha__acoes">
                <BotaoTouch onClick={() => abrir(produto)} disabled={sai}>
                  Editar
                </BotaoTouch>
                <BotaoTouch variante="perigo" onClick={() => remover(produto)} disabled={sai}>
                  Remover
                </BotaoTouch>
              </div>
            </div>
          );
        })}
        {produtos.length === 0 && <p className="admin-dica">Nenhum produto cadastrado.</p>}
      </div>
    </section>
  );
}
