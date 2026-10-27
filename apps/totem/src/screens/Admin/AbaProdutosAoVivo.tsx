import { useCallback, useEffect, useState } from 'react';
import type { CategoriaCardapio } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { FotoItem } from '../../components/FotoItem';
import { buscarConfig } from '../../services/apiClient';
import type { MudancaAoVivo, ProdutoAoVivo } from '../../services/adminApi';
import { centavosParaReais, formatarCentavos, reaisParaCentavos } from '../../utils/formatarMoeda';
import {
  Campo,
  CampoImagem,
  MensagemRetorno,
  Opcao,
  VALE_NA_HORA,
  useAcao,
  type PropsAbaFuncionario,
} from './comum';

const LADO_FOTO = 640;

interface FormAoVivo {
  preco: string;
  descricao: string;
  imagemUrl: string | null;
}

// Modo Funcionário (item 7): marca como esgotado (sem remover) e troca preço, foto e
// descrição. Vale na hora — a API já cobra o preço novo e os totens mostram na próxima
// releitura do cardápio (US 34). Criar, remover e o resto ficam com o Administrador.
export function AbaProdutosAoVivo({ api }: PropsAbaFuncionario) {
  const [produtos, setProdutos] = useState<ProdutoAoVivo[]>([]);
  const [categorias, setCategorias] = useState<CategoriaCardapio[]>([]);
  const [editando, setEditando] = useState<{ id: string; form: FormAoVivo } | null>(null);
  const { retorno, ocupado, executar } = useAcao();

  const carregar = useCallback(
    () =>
      executar(async () => {
        const [lista, config] = await Promise.all([api.listarProdutos(), buscarConfig()]);
        setProdutos(lista);
        setCategorias(config.categorias);
      }),
    [api, executar],
  );
  useEffect(() => {
    carregar();
  }, [carregar]);

  const nomeCategoria = (id: string) => categorias.find((c) => c.id === id)?.nome ?? '—';

  const alternarEsgotado = (produto: ProdutoAoVivo) =>
    executar(
      async () => {
        await api.atualizarProduto(produto.id, { disponivel: !produto.disponivel });
        setProdutos(await api.listarProdutos());
      },
      `${
        produto.disponivel
          ? `"${produto.nome}" marcado como esgotado.`
          : `"${produto.nome}" voltou à venda.`
      } ${VALE_NA_HORA}`,
    );

  // Manda só o que mudou: o resto segue como está (inclusive o que outro funcionário
  // tenha mudado nesse meio-tempo).
  async function salvar(produto: ProdutoAoVivo, form: FormAoVivo) {
    const salvou = await executar(async () => {
      const precoCentavos = reaisParaCentavos(form.preco);
      if (precoCentavos === null) {
        throw new Error('Informe o preço em reais, como 18,90');
      }
      const mudanca: MudancaAoVivo = {};
      if (precoCentavos !== produto.precoCentavos) mudanca.precoCentavos = precoCentavos;
      if (form.descricao !== produto.descricao) mudanca.descricao = form.descricao;
      if (form.imagemUrl !== (produto.imagemUrl ?? null)) mudanca.imagemUrl = form.imagemUrl;
      if (Object.keys(mudanca).length > 0) {
        await api.atualizarProduto(produto.id, mudanca);
        setProdutos(await api.listarProdutos());
      }
    }, `"${produto.nome}" atualizado. ${VALE_NA_HORA}`);
    if (salvou) setEditando(null);
  }

  const alterarForm = (parcial: Partial<FormAoVivo>) =>
    setEditando((atual) => (atual ? { ...atual, form: { ...atual.form, ...parcial } } : atual));

  return (
    <section className="admin-secao">
      <h2>Produtos à venda agora</h2>
      <p className="admin-dica">{VALE_NA_HORA}</p>
      <MensagemRetorno retorno={retorno} />

      <div className="admin-lista">
        {produtos.map((produto) => {
          const form = editando?.id === produto.id ? editando.form : null;
          // Combo esgota junto com qualquer item dele; aqui se vê o porquê.
          const esgotadoPorItem = produto.disponivel && !produto.disponivelNoTotem;
          return (
            <div key={produto.id} className="admin-linha admin-linha--ao-vivo">
              <FotoItem item={produto} categorias={categorias} className="admin-miniatura" />
              <div>
                <strong>{produto.nome}</strong>
                <small>
                  {nomeCategoria(produto.categoria)} · {formatarCentavos(produto.precoCentavos)}
                  {produto.estoque !== undefined && ` · ${produto.estoque} à venda`}
                </small>
                {esgotadoPorItem && (
                  <small className="admin-aviso">
                    {produto.componentes
                      ? 'Esgotado no totem: um dos itens do combo acabou.'
                      : 'Esgotado no totem: as unidades acabaram.'}
                  </small>
                )}
              </div>
              <div className="admin-linha__acoes">
                <Opcao
                  rotulo="Esgotado"
                  marcado={!produto.disponivel}
                  aoMudar={() => alternarEsgotado(produto)}
                  travado={ocupado}
                />
                {!form && (
                  <BotaoTouch
                    onClick={() =>
                      setEditando({
                        id: produto.id,
                        form: {
                          preco: centavosParaReais(produto.precoCentavos),
                          descricao: produto.descricao,
                          imagemUrl: produto.imagemUrl ?? null,
                        },
                      })
                    }
                  >
                    Preço, foto e descrição
                  </BotaoTouch>
                )}
              </div>

              {form && (
                <form
                  className="admin-form admin-linha__inteira"
                  onSubmit={(evento) => {
                    evento.preventDefault();
                    salvar(produto, form);
                  }}
                >
                  <div className="admin-grade">
                    <Campo rotulo="Preço (R$)">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.preco}
                        onChange={(evento) => alterarForm({ preco: evento.target.value })}
                      />
                    </Campo>
                    <Campo rotulo="Descrição">
                      <input
                        type="text"
                        value={form.descricao}
                        maxLength={200}
                        onChange={(evento) => alterarForm({ descricao: evento.target.value })}
                      />
                    </Campo>
                  </div>
                  <div className="admin-logo">
                    <FotoItem
                      item={{ ...produto, imagemUrl: form.imagemUrl ?? undefined }}
                      categorias={categorias}
                      className="admin-miniatura"
                    />
                    <CampoImagem
                      rotulo="Foto"
                      ladoMaximo={LADO_FOTO}
                      enviarImagem={api.enviarImagem}
                      executar={executar}
                      aoEnviar={(url) => alterarForm({ imagemUrl: url })}
                      aoRemover={
                        form.imagemUrl ? () => alterarForm({ imagemUrl: null }) : undefined
                      }
                      rotuloRemover="Tirar a foto"
                    />
                  </div>
                  <div className="admin-linha__acoes">
                    <BotaoTouch type="submit" variante="primario" disabled={ocupado}>
                      Salvar agora
                    </BotaoTouch>
                    <BotaoTouch onClick={() => setEditando(null)}>Cancelar</BotaoTouch>
                  </div>
                </form>
              )}
            </div>
          );
        })}
        {produtos.length === 0 && <p className="admin-dica">Nenhum produto cadastrado.</p>}
      </div>
      <BotaoTouch onClick={carregar}>Atualizar</BotaoTouch>
    </section>
  );
}
