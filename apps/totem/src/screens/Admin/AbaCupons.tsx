import { useCallback, useEffect, useState } from 'react';
import type { Cupom, CupomComSituacao, SituacaoCupom, TipoDescontoCupom } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import type { DadosCupom } from '../../services/adminApi';
import { centavosParaReais, formatarCentavos, reaisParaCentavos } from '../../utils/formatarMoeda';
import {
  Campo,
  MensagemRetorno,
  Opcao,
  SALVO_AGUARDA_REINICIO,
  useAcao,
  type PropsAba,
} from './comum';

// Campos do formulário de cupom, como texto digitado; viram DadosCupom ao salvar.
interface FormCupom {
  novo: boolean;
  codigo: string;
  tipoDesconto: TipoDescontoCupom;
  valor: string; // % ou R$, conforme o tipo
  validoDe: string; // formato do <input type="datetime-local">; vazio = sem limite
  validoAte: string;
  limiteUsos: string; // vazio = sem limite
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
    ativo: cupom.ativo,
  };
}

function dadosDoForm(form: FormCupom): DadosCupom {
  const valor =
    form.tipoDesconto === 'percentual'
      ? Number(form.valor.replace(',', '.'))
      : reaisParaCentavos(form.valor);
  if (valor === null || !Number.isFinite(valor) || valor <= 0) {
    throw new Error(
      form.tipoDesconto === 'percentual'
        ? 'Informe o percentual de desconto, como 10'
        : 'Informe o desconto em reais, como 5,00',
    );
  }
  const limite = form.limiteUsos.trim();
  if (limite && !/^\d+$/.test(limite)) {
    throw new Error('A quantidade de usos deve ser um número inteiro (ou vazia, para não limitar)');
  }
  return {
    codigo: form.codigo,
    tipoDesconto: form.tipoDesconto,
    valor,
    validoDe: campoParaIso(form.validoDe),
    validoAte: campoParaIso(form.validoAte),
    limiteUsos: limite ? Number(limite) : null,
    ativo: form.ativo,
  };
}

// Situação calculada pela API com a mesma regra que o totem usa para aceitar o cupom.
const SITUACOES: Record<SituacaoCupom, string> = {
  valido: 'Ativo',
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

export function AbaCupons({ api, config, salvarConfig }: PropsAba) {
  const [cupons, setCupons] = useState<CupomComSituacao[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [form, setForm] = useState<FormCupom | null>(null);
  const { retorno, ocupado, executar } = useAcao();
  const visiveis = cupons.filter(FILTROS.find((opcao) => opcao.id === filtro)?.aceita ?? Boolean);

  const carregar = useCallback(
    () => executar(async () => setCupons(await api.listarCupons())),
    [api, executar],
  );
  useEffect(() => {
    carregar();
  }, [carregar]);

  const alterar = (parcial: Partial<FormCupom>) =>
    setForm((atual) => (atual ? { ...atual, ...parcial } : atual));

  async function salvar(atual: FormCupom) {
    const salvou = await executar(async () => {
      const dados = dadosDoForm(atual);
      await (atual.novo ? api.criarCupom(dados) : api.atualizarCupom(atual.codigo, dados));
      setCupons(await api.listarCupons());
    }, 'Cupom salvo.');
    if (salvou) setForm(null);
  }

  const excluir = (cupom: Cupom) =>
    window.confirm(`Excluir o cupom ${cupom.codigo}?`) &&
    executar(async () => {
      await api.excluirCupom(cupom.codigo);
      setCupons(await api.listarCupons());
    }, `Cupom ${cupom.codigo} excluído.`);

  return (
    <section className="admin-secao">
      <h2>Cupons de desconto</h2>
      <Opcao
        rotulo="Aceitar cupons no totem"
        dica="Desmarcado, o campo de cupom some da tela de pagamento e nenhum cupom é aceito."
        marcado={config.cuponsHabilitados}
        aoMudar={(cuponsHabilitados) =>
          executar(() => salvarConfig({ ...config, cuponsHabilitados }), SALVO_AGUARDA_REINICIO)
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
          <Opcao rotulo="Cupom ativo" marcado={form.ativo} aoMudar={(ativo) => alterar({ ativo })} />
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
              <th>Vale a partir de</th>
              <th>Vale até</th>
              <th>Usos</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((cupom) => (
              <tr key={cupom.codigo}>
                <td>
                  <strong>{cupom.codigo}</strong>
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
                <td>{cupom.validoDe ? formatarDataHora(cupom.validoDe) : 'sem início'}</td>
                <td>{cupom.validoAte ? formatarDataHora(cupom.validoAte) : 'não expira'}</td>
                <td>
                  {cupom.usos ?? 0}
                  {cupom.limiteUsos === undefined ? ' (sem limite)' : ` de ${cupom.limiteUsos}`}
                </td>
                <td>
                  <div className="admin-linha__acoes">
                    <BotaoTouch onClick={() => setForm(formDoCupom(cupom))}>Editar</BotaoTouch>
                    <BotaoTouch variante="perigo" onClick={() => excluir(cupom)}>
                      Excluir
                    </BotaoTouch>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visiveis.length === 0 && <p className="admin-dica">Nenhum cupom nesta lista.</p>}
      </div>
    </section>
  );
}
