import { useCallback, useEffect, useState } from 'react';
import type {
  CategoriaCardapio,
  ComPendencia,
  Cupom,
  CupomComSituacao,
  ItemCardapio,
  RestricaoCupom,
  SituacaoCupom,
  TipoDescontoCupom,
} from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { CodigoQr } from '../../components/CodigoQr';
import { Modal } from '../../components/Modal';
import type { DadosCupom } from '../../services/adminApi';
import { centavosParaReais, formatarCentavos } from '../../utils/formatarMoeda';
import { qrDeCupom } from '../../utils/qr';
import { lerDescontoDoCupom, lerLimiteDeUsos, lerReaisOpcional } from '../../utils/valorCupom';
import {
  Campo,
  MensagemRetorno,
  Opcao,
  SALVO_PENDENTE,
  SeloPendente,
  useAcao,
  type PropsAba,
} from './comum';

// Item 6: para que o cupom vale.
type Alcance = 'pedido' | RestricaoCupom['tipo'];

const ALCANCES: { valor: Alcance; rotulo: string }[] = [
  { valor: 'pedido', rotulo: 'O pedido inteiro' },
  { valor: 'itens', rotulo: 'Só alguns itens' },
  { valor: 'categorias', rotulo: 'Só algumas categorias' },
];

// Campos do formulário de cupom, como texto digitado; viram DadosCupom ao salvar.
interface FormCupom {
  novo: boolean;
  codigo: string;
  tipoDesconto: TipoDescontoCupom;
  valor: string; // % ou R$, conforme o tipo
  validoDe: string; // formato do <input type="datetime-local">; vazio = sem limite
  validoAte: string;
  limiteUsos: string; // vazio = sem limite
  alcance: Alcance;
  idsAlcance: string[]; // itens ou categorias, conforme o alcance
  pedidoMinimo: string; // R$; vazio = sem mínimo
  descontoMaximo: string; // R$, só no percentual; vazio = sem teto
  ativo: boolean;
}

const FORM_VAZIO: FormCupom = {
  novo: true,
  codigo: '',
  tipoDesconto: 'percentual',
  valor: '',
  validoDe: '',
  validoAte: '',
  limiteUsos: '',
  alcance: 'pedido',
  idsAlcance: [],
  pedidoMinimo: '',
  descontoMaximo: '',
  ativo: true,
};

// ISO (UTC) <-> valor de <input type="datetime-local">, no horário do navegador.
function isoParaCampo(iso?: string): string {
  if (!iso) return '';
  const data = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, '0');
  return (
    `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}` +
    `T${dois(data.getHours())}:${dois(data.getMinutes())}`
  );
}

function campoParaIso(campo: string): string | null {
  return campo ? new Date(campo).toISOString() : null;
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function reaisOuVazio(centavos?: number): string {
  return centavos === undefined ? '' : centavosParaReais(centavos);
}

function formDoCupom(cupom: Cupom): FormCupom {
  return {
    novo: false,
    codigo: cupom.codigo,
    tipoDesconto: cupom.tipoDesconto,
    valor:
      cupom.tipoDesconto === 'percentual' ? String(cupom.valor) : centavosParaReais(cupom.valor),
    validoDe: isoParaCampo(cupom.validoDe),
    validoAte: isoParaCampo(cupom.validoAte),
    limiteUsos: cupom.limiteUsos === undefined ? '' : String(cupom.limiteUsos),
    alcance: cupom.aplicaEm?.tipo ?? 'pedido',
    idsAlcance: cupom.aplicaEm?.ids ?? [],
    pedidoMinimo: reaisOuVazio(cupom.pedidoMinimoCentavos),
    descontoMaximo: reaisOuVazio(cupom.descontoMaximoCentavos),
    ativo: cupom.ativo,
  };
}

function dadosDoForm(form: FormCupom): DadosCupom {
  return {
    codigo: form.codigo,
    tipoDesconto: form.tipoDesconto,
    // US 36: zero ou negativo é recusado aqui (e de novo na API).
    valor: lerDescontoDoCupom(form.tipoDesconto, form.valor),
    validoDe: campoParaIso(form.validoDe),
    validoAte: campoParaIso(form.validoAte),
    limiteUsos: lerLimiteDeUsos(form.limiteUsos),
    aplicaEm: form.alcance === 'pedido' ? null : { tipo: form.alcance, ids: form.idsAlcance },
    pedidoMinimoCentavos: lerReaisOpcional(form.pedidoMinimo, 'o pedido mínimo'),
    // O teto só existe no desconto em percentual.
    descontoMaximoCentavos:
      form.tipoDesconto === 'percentual'
        ? lerReaisOpcional(form.descontoMaximo, 'o desconto máximo')
        : null,
    ativo: form.ativo,
  };
}

// Resumo das regras do item 6, para a tabela.
function descreverRegras(
  cupom: Cupom,
  produtos: ItemCardapio[],
  categorias: CategoriaCardapio[],
): string {
  const partes: string[] = [];
  if (cupom.aplicaEm) {
    const fonte: { id: string; nome: string }[] =
      cupom.aplicaEm.tipo === 'itens' ? produtos : categorias;
    const nomes = cupom.aplicaEm.ids.map((id) => fonte.find((r) => r.id === id)?.nome ?? '?');
    partes.push(`só ${nomes.join(', ')}`);
  }
  if (cupom.pedidoMinimoCentavos) {
    partes.push(`a partir de ${formatarCentavos(cupom.pedidoMinimoCentavos)}`);
  }
  if (cupom.descontoMaximoCentavos) {
    partes.push(`até ${formatarCentavos(cupom.descontoMaximoCentavos)} de desconto`);
  }
  return partes.join(' · ') || 'pedido inteiro';
}

// Situação calculada pela API com a mesma regra que o totem usa para aceitar o cupom.
const SITUACOES: Record<SituacaoCupom, string> = {
  valido: 'Ativo',
  sem_desconto: 'Valor inválido',
  inativo: 'Desativado',
  nao_vigente: 'Ainda não vale',
  expirado: 'Expirado',
  esgotado: 'Esgotado',
};

type Filtro = 'todos' | 'ativos' | 'inativos';

const FILTROS: { id: Filtro; rotulo: string; aceita: (cupom: CupomComSituacao) => boolean }[] = [
  { id: 'todos', rotulo: 'Todos', aceita: () => true },
  { id: 'ativos', rotulo: 'Ativos', aceita: (cupom) => cupom.situacao === 'valido' },
  { id: 'inativos', rotulo: 'Inativos', aceita: (cupom) => cupom.situacao !== 'valido' },
];

export function AbaCupons({ api, config, salvarConfig, aoSalvar }: PropsAba) {
  const [cupons, setCupons] = useState<ComPendencia<CupomComSituacao>[]>([]);
  const [produtos, setProdutos] = useState<ComPendencia<ItemCardapio>[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [form, setForm] = useState<FormCupom | null>(null);
  // Código do cupom cujo QR está aberto na tela.
  const [qr, setQr] = useState<string | null>(null);
  const { retorno, ocupado, executar } = useAcao();
  const { categorias } = config;
  const visiveis = cupons.filter(FILTROS.find((opcao) => opcao.id === filtro)?.aceita ?? Boolean);
  // Itens que ficam depois do reinício podem entrar num cupom.
  const produtosQueFicam = produtos.filter((produto) => produto.pendente !== 'removido');

  const carregar = useCallback(
    () =>
      executar(async () => {
        const [listaCupons, listaProdutos] = await Promise.all([
          api.listarCupons(),
          api.listarProdutos(),
        ]);
        setCupons(listaCupons);
        setProdutos(listaProdutos);
      }),
    [api, executar],
  );
  useEffect(() => {
    carregar();
  }, [carregar]);

  const alterar = (parcial: Partial<FormCupom>) =>
    setForm((atual) => (atual ? { ...atual, ...parcial } : atual));

  const alternarAlcance = (id: string, marcado: boolean) =>
    setForm((atual) =>
      atual
        ? {
            ...atual,
            idsAlcance: marcado
              ? [...atual.idsAlcance, id]
              : atual.idsAlcance.filter((outro) => outro !== id),
          }
        : atual,
    );

  async function salvar(atual: FormCupom) {
    const salvou = await executar(async () => {
      const dados = dadosDoForm(atual);
      await (atual.novo ? api.criarCupom(dados) : api.atualizarCupom(atual.codigo, dados));
      setCupons(await api.listarCupons());
      aoSalvar();
    }, `Cupom salvo. ${SALVO_PENDENTE}`);
    if (salvou) setForm(null);
  }

  const excluir = (cupom: Cupom) =>
    window.confirm(`Excluir o cupom ${cupom.codigo} no próximo reinício?`) &&
    executar(async () => {
      await api.excluirCupom(cupom.codigo);
      setCupons(await api.listarCupons());
      aoSalvar();
    }, `O cupom ${cupom.codigo} sai no reinício.`);

  const opcoesAlcance: { id: string; nome: string }[] =
    form?.alcance === 'itens' ? produtosQueFicam : categorias;

  return (
    <section className="admin-secao">
      <h2>Cupons de desconto</h2>
      <Opcao
        rotulo="Aceitar cupons no totem"
        dica="Desmarcado, o campo de cupom some do carrinho e nenhum cupom é aceito."
        marcado={config.cuponsHabilitados}
        aoMudar={(cuponsHabilitados) =>
          executar(() => salvarConfig({ ...config, cuponsHabilitados }), SALVO_PENDENTE)
        }
      />
      <MensagemRetorno retorno={retorno} />

      {form ? (
        <form
          className="admin-form"
          onSubmit={(evento) => {
            evento.preventDefault();
            salvar(form);
          }}
        >
          <h3>{form.novo ? 'Novo cupom' : `Editar ${form.codigo}`}</h3>
          <div className="admin-grade">
            <Campo rotulo="Código" dica="De 3 a 20 letras ou números, sem espaços.">
              <input
                type="text"
                value={form.codigo}
                maxLength={20}
                disabled={!form.novo}
                onChange={(evento) => alterar({ codigo: evento.target.value.toUpperCase() })}
              />
            </Campo>
            <Campo rotulo="Tipo de desconto">
              <select
                value={form.tipoDesconto}
                onChange={(evento) =>
                  alterar({ tipoDesconto: evento.target.value as TipoDescontoCupom, valor: '' })
                }
              >
                <option value="percentual">Percentual (%)</option>
                <option value="valor_fixo">Valor fixo (R$)</option>
              </select>
            </Campo>
            <Campo rotulo={form.tipoDesconto === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)'}>
              <input
                type="text"
                inputMode="decimal"
                placeholder={form.tipoDesconto === 'percentual' ? '10' : '5,00'}
                value={form.valor}
                onChange={(evento) => alterar({ valor: evento.target.value })}
              />
            </Campo>
            {form.tipoDesconto === 'percentual' && (
              <Campo
                rotulo="Desconto máximo (R$)"
                dica="Teto do percentual, ex.: 10% limitado a R$ 50,00. Vazio = sem teto."
              >
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="50,00"
                  value={form.descontoMaximo}
                  onChange={(evento) => alterar({ descontoMaximo: evento.target.value })}
                />
              </Campo>
            )}
            <Campo rotulo="Pedido mínimo (R$)" dica="Vazio = qualquer valor.">
              <input
                type="text"
                inputMode="decimal"
                placeholder="30,00"
                value={form.pedidoMinimo}
                onChange={(evento) => alterar({ pedidoMinimo: evento.target.value })}
              />
            </Campo>
            <Campo rotulo="Quantidade de usos" dica="Vazio = sem limite.">
              <input
                type="text"
                inputMode="numeric"
                value={form.limiteUsos}
                onChange={(evento) => alterar({ limiteUsos: evento.target.value })}
              />
            </Campo>
            <Campo rotulo="Vale a partir de" dica="Data e hora. Vazio = já vale.">
              <input
                type="datetime-local"
                value={form.validoDe}
                onChange={(evento) => alterar({ validoDe: evento.target.value })}
              />
            </Campo>
            <Campo rotulo="Vale até" dica="Data e hora. Vazio = não expira.">
              <input
                type="datetime-local"
                value={form.validoAte}
                onChange={(evento) => alterar({ validoAte: evento.target.value })}
              />
            </Campo>
          </div>

          <fieldset className="admin-escolha">
            <legend className="admin-campo__rotulo">Vale para</legend>
            {ALCANCES.map(({ valor, rotulo }) => (
              <label key={valor} className="admin-opcao">
                <input
                  type="radio"
                  name="alcance-cupom"
                  checked={form.alcance === valor}
                  onChange={() => alterar({ alcance: valor, idsAlcance: [] })}
                />
                <span>
                  <strong>{rotulo}</strong>
                </span>
              </label>
            ))}
            {form.alcance !== 'pedido' && (
              <>
                <small>
                  O desconto é calculado só sobre{' '}
                  {form.alcance === 'itens' ? 'esses itens' : 'os itens dessas categorias'} no
                  carrinho; sem nenhum deles, o cupom não é aceito.
                </small>
                <div className="admin-marcar">
                  {opcoesAlcance.map((opcao) => (
                    <Opcao
                      key={opcao.id}
                      rotulo={opcao.nome}
                      marcado={form.idsAlcance.includes(opcao.id)}
                      aoMudar={(marcado) => alternarAlcance(opcao.id, marcado)}
                    />
                  ))}
                </div>
              </>
            )}
          </fieldset>

          <Opcao
            rotulo="Cupom ativo"
            marcado={form.ativo}
            aoMudar={(ativo) => alterar({ ativo })}
          />
          <div className="admin-linha__acoes">
            <BotaoTouch type="submit" variante="primario" disabled={ocupado}>
              Salvar cupom
            </BotaoTouch>
            <BotaoTouch onClick={() => setForm(null)}>Cancelar</BotaoTouch>
          </div>
        </form>
      ) : (
        <BotaoTouch variante="primario" onClick={() => setForm(FORM_VAZIO)}>
          + Novo cupom
        </BotaoTouch>
      )}

      {/* US 13: todos os cupons, ativos e inativos, com seus atributos. "Ativo" aqui é o
          que o totem aceita agora; nos demais, a situação diz por que é recusado. */}
      <div className="admin__abas" role="group" aria-label="Filtrar cupons">
        {FILTROS.map((opcao) => (
          <BotaoTouch
            key={opcao.id}
            variante={filtro === opcao.id ? 'destaque' : 'padrao'}
            onClick={() => setFiltro(opcao.id)}
          >
            {opcao.rotulo} ({cupons.filter(opcao.aceita).length})
          </BotaoTouch>
        ))}
      </div>
      {!config.cuponsHabilitados && (
        <p className="admin-dica">
          Os cupons estão desligados: nenhum é aceito no totem, qualquer que seja a situação.
        </p>
      )}

      <div className="admin-lista admin-lista--tabela">
        <table className="admin-tabela">
          <thead>
            <tr>
              <th>Código</th>
              <th>Situação</th>
              <th>Desconto</th>
              <th>Regras</th>
              <th>Validade</th>
              <th>Usos</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((cupom) => {
              const sai = cupom.pendente === 'removido';
              return (
                <tr key={cupom.codigo}>
                  <td>
                    <strong>{cupom.codigo}</strong>
                    <SeloPendente pendente={cupom.pendente} />
                  </td>
                  <td>
                    <span className={`admin-situacao admin-situacao--${cupom.situacao}`}>
                      {SITUACOES[cupom.situacao]}
                    </span>
                  </td>
                  <td>
                    {cupom.tipoDesconto === 'percentual'
                      ? `${cupom.valor}%`
                      : formatarCentavos(cupom.valor)}
                  </td>
                  <td className="admin-tabela__quebra">
                    {descreverRegras(cupom, produtos, categorias)}
                  </td>
                  <td>
                    {cupom.validoDe ? `de ${formatarDataHora(cupom.validoDe)}` : 'sem início'}
                    <br />
                    {cupom.validoAte ? `até ${formatarDataHora(cupom.validoAte)}` : 'não expira'}
                  </td>
                  <td>
                    {cupom.usos ?? 0}
                    {cupom.limiteUsos === undefined ? ' (sem limite)' : ` de ${cupom.limiteUsos}`}
                  </td>
                  <td>
                    <div className="admin-linha__acoes">
                      <BotaoTouch onClick={() => setQr(cupom.codigo)}>QR</BotaoTouch>
                      <BotaoTouch onClick={() => setForm(formDoCupom(cupom))} disabled={sai}>
                        Editar
                      </BotaoTouch>
                      <BotaoTouch variante="perigo" onClick={() => excluir(cupom)} disabled={sai}>
                        Excluir
                      </BotaoTouch>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visiveis.length === 0 && <p className="admin-dica">Nenhum cupom nesta lista.</p>}
      </div>

      {qr && (
        <Modal titulo={`Cupom ${qr}`} aoFechar={() => setQr(null)}>
          <p>
            Mostre este QR na câmera do totem (no cardápio ou no carrinho) para aplicar o cupom.
          </p>
          <CodigoQr texto={qrDeCupom(qr)} rotulo={`QR do cupom ${qr}`} />
        </Modal>
      )}
    </section>
  );
}
