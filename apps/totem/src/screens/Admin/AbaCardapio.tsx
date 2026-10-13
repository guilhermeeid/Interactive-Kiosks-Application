import { useCallback, useEffect, useRef, useState } from 'react';
import type { CategoriaCardapio, ItemCardapio } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import type { DadosProduto } from '../../services/adminApi';
import { urlImagem } from '../../services/apiClient';
import { centavosParaReais, formatarCentavos, reaisParaCentavos } from '../../utils/formatarMoeda';
import { redimensionarImagem } from '../../utils/imagem';
import { visualItem } from '../../utils/visualCategoria';
import {
  Campo,
  MensagemRetorno,
  Opcao,
  SALVO_AGUARDA_REINICIO,
  useAcao,
  type PropsAba,
} from './comum';

// Lado máximo da foto de um item: o card do totem a exibe com 150px de altura.
const LADO_FOTO = 640;

export function AbaCardapio(props: PropsAba) {
  return (
    <>
      <SecaoCategorias {...props} />
      <SecaoProdutos {...props} />
    </>
  );
}

// ---------- Categorias ----------

function SecaoCategorias({ config, salvarConfig }: PropsAba) {
  const [categorias, setCategorias] = useState<CategoriaCardapio[]>(config.categorias);
  const [exibirTodos, setExibirTodos] = useState(config.exibirTodos);
  const { retorno, ocupado, executar } = useAcao();
  // Categorias novas ganham um id provisório; o servidor gera o definitivo ao salvar.
  const proximaNova = useRef(1);

  const alterar = (indice: number, parcial: Partial<CategoriaCardapio>) =>
    setCategorias((atuais) => atuais.map((c, i) => (i === indice ? { ...c, ...parcial } : c)));

  const mover = (indice: number, passo: -1 | 1) =>
    setCategorias((atuais) => {
      const destino = indice + passo;
      if (destino < 0 || destino >= atuais.length) return atuais;
      const copia = [...atuais];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });

  const salvar = () =>
    executar(async () => {
      const salva = await salvarConfig({ ...config, categorias, exibirTodos });
      setCategorias(salva.categorias);
    }, SALVO_AGUARDA_REINICIO);

  return (
    <form
      className="admin-secao"
      onSubmit={(evento) => {
        evento.preventDefault();
        salvar();
      }}
    >
      <h2>Categorias</h2>
      <p className="admin-dica">A ordem daqui é a ordem das abas no totem.</p>
      <div className="admin-lista">
        {categorias.map((categoria, indice) => (
          <div key={categoria.id} className="admin-linha admin-linha--categoria">
            <Campo rotulo="Ícone">
              <input
                type="text"
                value={categoria.icone ?? ''}
                maxLength={8}
                onChange={(evento) => alterar(indice, { icone: evento.target.value })}
              />
            </Campo>
            <Campo rotulo="Nome">
              <input
                type="text"
                value={categoria.nome}
                maxLength={30}
                onChange={(evento) => alterar(indice, { nome: evento.target.value })}
              />
            </Campo>
            <div className="admin-linha__acoes">
              <BotaoTouch
                aria-label={`Subir ${categoria.nome}`}
                onClick={() => mover(indice, -1)}
                disabled={indice === 0}
              >
                ↑
              </BotaoTouch>
              <BotaoTouch
                aria-label={`Descer ${categoria.nome}`}
                onClick={() => mover(indice, 1)}
                disabled={indice === categorias.length - 1}
              >
                ↓
              </BotaoTouch>
              <BotaoTouch
                variante="perigo"
                onClick={() => setCategorias((atuais) => atuais.filter((_, i) => i !== indice))}
              >
                Remover
              </BotaoTouch>
            </div>
          </div>
        ))}
      </div>
      <BotaoTouch
        onClick={() =>
          setCategorias((atuais) => [
            ...atuais,
            { id: `nova-${proximaNova.current++}`, nome: '', icone: '' },
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

// ---------- Produtos ----------

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
}

function formVazio(categoria: string): FormProduto {
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
  };
}

function dadosDoForm(form: FormProduto): DadosProduto {
  const precoCentavos = reaisParaCentavos(form.preco);
  if (precoCentavos === null) {
    throw new Error('Informe o preço em reais, como 18,90');
  }
  const estoque = form.estoque.trim();
  if (estoque && !/^\d+$/.test(estoque)) {
    throw new Error('A quantidade deve ser um número inteiro (ou vazia, para não controlar)');
  }
  return {
    nome: form.nome,
    descricao: form.descricao,
    categoria: form.categoria,
    precoCentavos,
    icone: form.icone.trim() || null,
    imagemUrl: form.imagemUrl,
    estoque: estoque ? Number(estoque) : null,
    disponivel: form.disponivel,
  };
}

function SecaoProdutos({ api, config }: PropsAba) {
  const [produtos, setProdutos] = useState<ItemCardapio[]>([]);
  const [form, setForm] = useState<FormProduto | null>(null);
  const { retorno, ocupado, executar } = useAcao();
  const { categorias } = config;

  const carregar = useCallback(
    () => executar(async () => setProdutos(await api.listarProdutos())),
    [api, executar],
  );
  useEffect(() => {
    carregar();
  }, [carregar]);

  const alterar = (parcial: Partial<FormProduto>) =>
    setForm((atual) => (atual ? { ...atual, ...parcial } : atual));

  const enviarFoto = (arquivo: File) =>
    executar(async () => {
      const { url } = await api.enviarImagem(await redimensionarImagem(arquivo, LADO_FOTO));
      alterar({ imagemUrl: url });
    });

  async function salvar(atual: FormProduto) {
    const salvou = await executar(async () => {
      const dados = dadosDoForm(atual);
      await (atual.id ? api.atualizarProduto(atual.id, dados) : api.criarProduto(dados));
      setProdutos(await api.listarProdutos());
    }, 'Produto salvo.');
    if (salvou) setForm(null);
  }

  const alternarDisponivel = (produto: ItemCardapio) =>
    executar(async () => {
      await api.atualizarProduto(produto.id, {
        ...dadosDoProduto(produto),
        disponivel: !produto.disponivel,
      });
      setProdutos(await api.listarProdutos());
    });

  const remover = (produto: ItemCardapio) =>
    window.confirm(`Remover "${produto.nome}" do cardápio?`) &&
    executar(async () => {
      await api.removerProduto(produto.id);
      setProdutos(await api.listarProdutos());
    }, `"${produto.nome}" removido.`);

  const nomeCategoria = (id: string) => categorias.find((c) => c.id === id)?.nome ?? '—';

  return (
    <section className="admin-secao">
      <h2>Produtos</h2>
      <MensagemRetorno retorno={retorno} />

      {form ? (
        <form
          className="admin-form"
          onSubmit={(evento) => {
            evento.preventDefault();
            salvar(form);
          }}
        >
          <h3>{form.id ? `Editar ${form.nome}` : 'Novo produto'}</h3>
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
            <Campo rotulo="Preço (R$)">
              <input
                type="text"
                inputMode="decimal"
                placeholder="18,90"
                value={form.preco}
                onChange={(evento) => alterar({ preco: evento.target.value })}
              />
            </Campo>
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
          </div>
          <Campo rotulo="Descrição">
            <input
              type="text"
              value={form.descricao}
              maxLength={200}
              onChange={(evento) => alterar({ descricao: evento.target.value })}
            />
          </Campo>

          <div className="admin-logo">
            <span className="admin-miniatura" aria-hidden="true">
              {form.imagemUrl ? (
                <img src={urlImagem(form.imagemUrl)} alt="" />
              ) : (
                form.icone || '🍽️'
              )}
            </span>
            <Campo rotulo="Ícone/emoji" dica="Usado quando não há foto.">
              <input
                type="text"
                value={form.icone}
                maxLength={8}
                onChange={(evento) => alterar({ icone: evento.target.value })}
              />
            </Campo>
            <Campo rotulo="Foto">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(evento) => {
                  const arquivo = evento.target.files?.[0];
                  if (arquivo) enviarFoto(arquivo);
                  evento.target.value = '';
                }}
              />
            </Campo>
            {form.imagemUrl && (
              <BotaoTouch variante="perigo" onClick={() => alterar({ imagemUrl: null })}>
                Tirar a foto
              </BotaoTouch>
            )}
          </div>

          <Opcao
            rotulo="Disponível para venda"
            dica='Desmarcado, o item aparece no totem como "Esgotado".'
            marcado={form.disponivel}
            aoMudar={(disponivel) => alterar({ disponivel })}
          />

          <div className="admin-linha__acoes">
            <BotaoTouch type="submit" variante="primario" disabled={ocupado}>
              Salvar produto
            </BotaoTouch>
            <BotaoTouch onClick={() => setForm(null)}>Cancelar</BotaoTouch>
          </div>
        </form>
      ) : (
        <BotaoTouch variante="primario" onClick={() => setForm(formVazio(categorias[0].id))}>
          + Novo produto
        </BotaoTouch>
      )}

      <div className="admin-lista">
        {produtos.map((produto) => (
          <div key={produto.id} className="admin-linha admin-linha--produto">
            <span className="admin-miniatura" aria-hidden="true">
              {produto.imagemUrl ? (
                <img src={urlImagem(produto.imagemUrl)} alt="" />
              ) : (
                visualItem(produto, categorias).icone
              )}
            </span>
            <div>
              <strong>{produto.nome}</strong>
              <small>
                {nomeCategoria(produto.categoria)} · {formatarCentavos(produto.precoCentavos)} ·{' '}
                {produto.estoque === undefined
                  ? 'sem controle de quantidade'
                  : `${produto.estoque} à venda`}
              </small>
            </div>
            <Opcao
              rotulo="Disponível"
              marcado={produto.disponivel}
              aoMudar={() => alternarDisponivel(produto)}
            />
            <div className="admin-linha__acoes">
              <BotaoTouch onClick={() => setForm(formDoProduto(produto))}>Editar</BotaoTouch>
              <BotaoTouch variante="perigo" onClick={() => remover(produto)}>
                Remover
              </BotaoTouch>
            </div>
          </div>
        ))}
        {produtos.length === 0 && <p className="admin-dica">Nenhum produto cadastrado.</p>}
      </div>
    </section>
  );
}
