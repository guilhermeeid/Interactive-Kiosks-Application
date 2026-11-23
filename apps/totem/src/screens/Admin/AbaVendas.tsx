import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AgrupamentoVendas,
  ConsumoPedido,
  FiltroRelatorioVendas,
  FormaPagamento,
  RelatorioVendas,
  VendasPorConsumo,
} from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { FORMAS_PAGAMENTO, nomeFormaPagamento } from '../../utils/formasPagamento';
import { formatarCentavos } from '../../utils/formatarMoeda';
import { MensagemRetorno, useAcao, type PropsAba } from './comum';
import {
  BarraSegmentada,
  BarrasDeitadas,
  CartaoGrafico,
  GraficoColunas,
  type PontoColuna,
} from './graficos';

// US 25: relatório de vendas e mais vendidos. Faturamento do período, ranking dos
// produtos, quebras por categoria, forma de pagamento e consumo. Os filtros ficam numa
// linha só, acima de tudo, e valem para todos os números da aba.

type Periodo = 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | 'mes_passado' | 'ano' | 'tudo' | 'outro';

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: 'ontem', rotulo: 'Ontem' },
  { valor: '7d', rotulo: 'Últimos 7 dias' },
  { valor: '30d', rotulo: 'Últimos 30 dias' },
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'mes_passado', rotulo: 'Mês passado' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'tudo', rotulo: 'Todo o período' },
  { valor: 'outro', rotulo: 'Escolher datas…' },
];

const NOMES_CONSUMO: Record<ConsumoPedido | 'nao_informado', string> = {
  local: 'Para comer aqui',
  viagem: 'Para levar',
  nao_informado: 'Não informado',
};

const CLASSES_CONSUMO: Record<VendasPorConsumo['consumo'], string> = {
  local: 'serie-1',
  viagem: 'serie-2',
  nao_informado: 'serie-neutra',
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Data do calendário no horário do navegador (AAAA-MM-DD).
function dia(data: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
}

function intervaloDoPeriodo(periodo: Periodo, hoje = new Date()): { de?: string; ate?: string } {
  const menos = (dias: number) =>
    dia(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - dias));
  switch (periodo) {
    case 'hoje':
      return { de: dia(hoje), ate: dia(hoje) };
    case 'ontem':
      return { de: menos(1), ate: menos(1) };
    case '7d':
      return { de: menos(6), ate: dia(hoje) };
    case '30d':
      return { de: menos(29), ate: dia(hoje) };
    case 'mes':
      return { de: dia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: dia(hoje) };
    case 'mes_passado':
      return {
        de: dia(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
        ate: dia(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
      };
    case 'ano':
      return { de: dia(new Date(hoje.getFullYear(), 0, 1)), ate: dia(hoje) };
    default:
      return {};
  }
}

function dataPorExtenso(diaIso: string): string {
  const [ano, mes, d] = diaIso.split('-');
  return `${d}/${mes}/${ano}`;
}

// Rótulos do eixo X e da dica, conforme o agrupamento da série.
function rotulosDoPonto(chave: string, agrupamento: AgrupamentoVendas) {
  if (agrupamento === 'hora') {
    const hora = Number(chave.slice(11, 13));
    return { curto: `${hora}h`, completo: `${hora}h às ${hora + 1}h` };
  }
  if (agrupamento === 'dia') {
    const [ano, mes, d] = chave.split('-');
    return { curto: `${d}/${mes}`, completo: `${d}/${mes}/${ano}` };
  }
  const [ano, mes] = chave.split('-');
  const nome = MESES[Number(mes) - 1];
  return { curto: `${nome}/${ano.slice(2)}`, completo: `${nome}/${ano}` };
}

// Eixo do dinheiro: inteiro até 9.999 reais; acima disso, compacto (10 mil, 1,5 mi).
function reaisNoEixo(centavos: number): string {
  const reais = centavos / 100;
  if (reais < 10_000) {
    return `R$ ${reais.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  }
  return `R$ ${reais.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}`;
}

const porcentagem = (parte: number, total: number) =>
  total > 0 ? `${Math.round((parte / total) * 100)}%` : '0%';

const plural = (n: number, um: string, varios: string) =>
  `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

const TITULO_DA_SERIE: Record<AgrupamentoVendas, string> = {
  hora: 'Faturamento por hora',
  dia: 'Faturamento por dia',
  mes: 'Faturamento por mês',
};

export function AbaVendas({ api, config }: PropsAba) {
  const [periodo, setPeriodo] = useState<Periodo>('30d');
  const [datas, setDatas] = useState(() => intervaloDoPeriodo('7d'));
  const [categoria, setCategoria] = useState('');
  const [forma, setForma] = useState<FormaPagamento | ''>('');
  const [consumo, setConsumo] = useState<ConsumoPedido | ''>('');
  const [relatorio, setRelatorio] = useState<RelatorioVendas | null>(null);
  const [rankingPor, setRankingPor] = useState<'quantidade' | 'faturamento'>('quantidade');
  // "Atualizar" renova o "hoje": refaz a consulta e as datas relativas (ex.: depois da
  // meia-noite, "Hoje" passa a ser o novo dia).
  const [hoje, setHoje] = useState(() => new Date());
  const { retorno, ocupado, executar } = useAcao();

  const filtro: FiltroRelatorioVendas = useMemo(
    () => ({
      ...(periodo === 'outro' ? datas : intervaloDoPeriodo(periodo, hoje)),
      categoria: categoria || undefined,
      formaPagamento: forma || undefined,
      consumo: consumo || undefined,
    }),
    [periodo, datas, categoria, forma, consumo, hoje],
  );

  const carregar = useCallback(
    () => executar(async () => setRelatorio(await api.relatorioVendas(filtro))),
    [api, executar, filtro],
  );
  useEffect(() => {
    carregar();
  }, [carregar]);

  // Categorias para o filtro: as do cardápio e as que aparecem nas vendas (uma categoria
  // removida continua no histórico).
  const opcoesCategoria = useMemo(() => {
    const mapa = new Map(config.categorias.map((c) => [c.id, c.nome]));
    for (const c of relatorio?.categorias ?? []) {
      if (!mapa.has(c.id)) mapa.set(c.id, c.nome);
    }
    return [...mapa].map(([id, nome]) => ({ id, nome }));
  }, [config.categorias, relatorio?.categorias]);

  const filtros = (
    <div className="relatorio-filtros" role="group" aria-label="Filtros do relatório">
      <label className="admin-campo">
        <span className="admin-campo__rotulo">Período</span>
        <select value={periodo} onChange={(evento) => setPeriodo(evento.target.value as Periodo)}>
          {PERIODOS.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      </label>
      {periodo === 'outro' && (
        <>
          <label className="admin-campo">
            <span className="admin-campo__rotulo">De</span>
            <input
              type="date"
              value={datas.de ?? ''}
              max={datas.ate}
              onChange={(evento) => setDatas((atual) => ({ ...atual, de: evento.target.value }))}
            />
          </label>
          <label className="admin-campo">
            <span className="admin-campo__rotulo">Até</span>
            <input
              type="date"
              value={datas.ate ?? ''}
              min={datas.de}
              onChange={(evento) => setDatas((atual) => ({ ...atual, ate: evento.target.value }))}
            />
          </label>
        </>
      )}
      <label className="admin-campo">
        <span className="admin-campo__rotulo">Categoria</span>
        <select value={categoria} onChange={(evento) => setCategoria(evento.target.value)}>
          <option value="">Todas</option>
          {opcoesCategoria.map((opcao) => (
            <option key={opcao.id} value={opcao.id}>
              {opcao.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-campo">
        <span className="admin-campo__rotulo">Pagamento</span>
        <select
          value={forma}
          onChange={(evento) => setForma(evento.target.value as FormaPagamento | '')}
        >
          <option value="">Todos</option>
          {FORMAS_PAGAMENTO.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-campo">
        <span className="admin-campo__rotulo">Consumo</span>
        <select
          value={consumo}
          onChange={(evento) => setConsumo(evento.target.value as ConsumoPedido | '')}
        >
          <option value="">Todos</option>
          <option value="local">Para comer aqui</option>
          <option value="viagem">Para levar</option>
        </select>
      </label>
      <BotaoTouch onClick={() => setHoje(new Date())} disabled={ocupado}>
        Atualizar
      </BotaoTouch>
    </div>
  );

  if (!relatorio) {
    return (
      <section className="admin-secao relatorio">
        <h2>Vendas</h2>
        {filtros}
        <MensagemRetorno retorno={retorno} />
      </section>
    );
  }

  const { resumo } = relatorio;
  const textoDoPeriodo =
    relatorio.de && relatorio.ate
      ? relatorio.de === relatorio.ate
        ? dataPorExtenso(relatorio.de)
        : `${dataPorExtenso(relatorio.de)} a ${dataPorExtenso(relatorio.ate)}`
      : 'todo o período';
  const semVendas = resumo.pedidos === 0;

  const pontos: PontoColuna[] = relatorio.serie.map((ponto) => {
    const rotulos = rotulosDoPonto(ponto.chave, relatorio.agrupamento);
    return {
      rotulo: rotulos.curto,
      rotuloCompleto: rotulos.completo,
      valor: ponto.faturamentoCentavos,
      detalhe: plural(ponto.pedidos, 'pedido', 'pedidos'),
    };
  });

  const ranking = [...relatorio.maisVendidos].sort((a, b) =>
    rankingPor === 'quantidade'
      ? b.quantidade - a.quantidade || b.faturamentoCentavos - a.faturamentoCentavos
      : b.faturamentoCentavos - a.faturamentoCentavos || b.quantidade - a.quantidade,
  );
  const TOPO_DO_RANKING = 10;

  return (
    <section
      className={ocupado ? 'admin-secao relatorio relatorio--carregando' : 'admin-secao relatorio'}
      aria-busy={ocupado}
    >
      <h2>Vendas</h2>
      {filtros}
      <MensagemRetorno retorno={retorno} />
      <p className="admin-dica">
        Período: {textoDoPeriodo}. Uma venda conta quando o pagamento é aprovado (em dinheiro,
        quando o caixa confirma o recebimento).
      </p>

      {semVendas ? (
        <div className="relatorio-vazio" role="status">
          <strong>
            {relatorio.totalDeVendas === 0
              ? 'Ainda não há vendas registradas.'
              : 'Nenhuma venda neste período.'}
          </strong>
          <span>
            {relatorio.totalDeVendas === 0
              ? 'As vendas aparecem aqui assim que o primeiro pagamento for aprovado.'
              : 'Escolha outro período ou tire algum filtro para ver as vendas.'}
          </span>
        </div>
      ) : (
        <>
          <div className="relatorio-numeros">
            <div className="relatorio-destaque">
              <span>Faturamento</span>
              <strong>{formatarCentavos(resumo.faturamentoCentavos)}</strong>
              <small>
                {formatarCentavos(resumo.valorBrutoCentavos)} em produtos
                {resumo.descontosCentavos > 0 &&
                  ` − ${formatarCentavos(resumo.descontosCentavos)} de descontos`}
              </small>
            </div>
            <div className="relatorio-numero">
              <span>Pedidos</span>
              <strong>{resumo.pedidos.toLocaleString('pt-BR')}</strong>
            </div>
            <div className="relatorio-numero">
              <span>Ticket médio</span>
              <strong>{formatarCentavos(resumo.ticketMedioCentavos)}</strong>
            </div>
            <div className="relatorio-numero">
              <span>Itens vendidos</span>
              <strong>{resumo.itensVendidos.toLocaleString('pt-BR')}</strong>
            </div>
          </div>

          <CartaoGrafico
            titulo={TITULO_DA_SERIE[relatorio.agrupamento]}
            subtitulo={`${textoDoPeriodo} · depois dos descontos`}
            tabela={
              <table className="admin-tabela">
                <thead>
                  <tr>
                    <th>
                      {relatorio.agrupamento === 'hora'
                        ? 'Hora'
                        : relatorio.agrupamento === 'dia'
                          ? 'Dia'
                          : 'Mês'}
                    </th>
                    <th>Pedidos</th>
                    <th>Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {pontos.map((ponto, indice) => (
                    <tr key={ponto.rotuloCompleto}>
                      <td>{ponto.rotuloCompleto}</td>
                      <td>{relatorio.serie[indice].pedidos}</td>
                      <td>{formatarCentavos(ponto.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <GraficoColunas
              pontos={pontos}
              formatarEixo={reaisNoEixo}
              formatarValor={formatarCentavos}
              descricao={`${TITULO_DA_SERIE[relatorio.agrupamento]}, ${textoDoPeriodo}. Total ${formatarCentavos(resumo.faturamentoCentavos)}.`}
            />
          </CartaoGrafico>

          <CartaoGrafico
            titulo="Mais vendidos"
            subtitulo={
              ranking.length > TOPO_DO_RANKING
                ? `Os ${TOPO_DO_RANKING} primeiros de ${ranking.length} produtos; a tabela tem todos.`
                : undefined
            }
            acoes={
              <div className="relatorio-alternar" role="group" aria-label="Ordenar o ranking por">
                <BotaoTouch
                  variante={rankingPor === 'quantidade' ? 'destaque' : 'padrao'}
                  aria-pressed={rankingPor === 'quantidade'}
                  onClick={() => setRankingPor('quantidade')}
                >
                  Unidades
                </BotaoTouch>
                <BotaoTouch
                  variante={rankingPor === 'faturamento' ? 'destaque' : 'padrao'}
                  aria-pressed={rankingPor === 'faturamento'}
                  onClick={() => setRankingPor('faturamento')}
                >
                  Faturamento
                </BotaoTouch>
              </div>
            }
            tabela={
              <table className="admin-tabela">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th>Unidades</th>
                    <th>Faturamento</th>
                    <th>Parte do faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((produto, indice) => (
                    <tr key={produto.itemCardapioId}>
                      <td>{indice + 1}º</td>
                      <td>{produto.nome}</td>
                      <td>{produto.categoriaNome}</td>
                      <td>{produto.quantidade.toLocaleString('pt-BR')}</td>
                      <td>{formatarCentavos(produto.faturamentoCentavos)}</td>
                      <td>
                        {porcentagem(produto.faturamentoCentavos, resumo.faturamentoCentavos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <BarrasDeitadas
              descricao={`Mais vendidos por ${rankingPor === 'quantidade' ? 'unidades' : 'faturamento'}`}
              linhas={ranking.slice(0, TOPO_DO_RANKING).map((produto, indice) => ({
                chave: produto.itemCardapioId,
                rotulo: `${indice + 1}º ${produto.nome}`,
                valor:
                  rankingPor === 'quantidade' ? produto.quantidade : produto.faturamentoCentavos,
                textoDoValor:
                  rankingPor === 'quantidade'
                    ? plural(produto.quantidade, 'unid.', 'unid.')
                    : formatarCentavos(produto.faturamentoCentavos),
                detalhe: `${plural(produto.quantidade, 'unidade', 'unidades')} · ${formatarCentavos(produto.faturamentoCentavos)} (${porcentagem(produto.faturamentoCentavos, resumo.faturamentoCentavos)} do faturamento)`,
              }))}
            />
          </CartaoGrafico>

          <div className="relatorio-grade">
            <CartaoGrafico
              titulo="Por categoria"
              subtitulo="Faturamento de cada categoria"
              tabela={
                <table className="admin-tabela">
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th>Unidades</th>
                      <th>Faturamento</th>
                      <th>Parte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.porCategoria.map((linha) => (
                      <tr key={linha.categoria}>
                        <td>{linha.nome}</td>
                        <td>{linha.quantidade.toLocaleString('pt-BR')}</td>
                        <td>{formatarCentavos(linha.faturamentoCentavos)}</td>
                        <td>
                          {porcentagem(linha.faturamentoCentavos, resumo.faturamentoCentavos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <BarrasDeitadas
                descricao="Faturamento por categoria"
                linhas={relatorio.porCategoria.map((linha) => ({
                  chave: linha.categoria,
                  rotulo: linha.nome,
                  valor: linha.faturamentoCentavos,
                  textoDoValor: formatarCentavos(linha.faturamentoCentavos),
                  detalhe: `${plural(linha.quantidade, 'unidade', 'unidades')} · ${porcentagem(linha.faturamentoCentavos, resumo.faturamentoCentavos)} do faturamento`,
                }))}
              />
            </CartaoGrafico>

            <CartaoGrafico
              titulo="Por forma de pagamento"
              subtitulo="Faturamento de cada forma"
              tabela={
                <table className="admin-tabela">
                  <thead>
                    <tr>
                      <th>Forma</th>
                      <th>Pedidos</th>
                      <th>Faturamento</th>
                      <th>Parte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.porFormaPagamento.map((linha) => (
                      <tr key={linha.formaPagamento}>
                        <td>{nomeFormaPagamento(linha.formaPagamento)}</td>
                        <td>{linha.pedidos.toLocaleString('pt-BR')}</td>
                        <td>{formatarCentavos(linha.faturamentoCentavos)}</td>
                        <td>
                          {porcentagem(linha.faturamentoCentavos, resumo.faturamentoCentavos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <BarrasDeitadas
                descricao="Faturamento por forma de pagamento"
                linhas={relatorio.porFormaPagamento.map((linha) => ({
                  chave: linha.formaPagamento,
                  rotulo: nomeFormaPagamento(linha.formaPagamento),
                  valor: linha.faturamentoCentavos,
                  textoDoValor: formatarCentavos(linha.faturamentoCentavos),
                  detalhe: `${plural(linha.pedidos, 'pedido', 'pedidos')} · ${porcentagem(linha.faturamentoCentavos, resumo.faturamentoCentavos)} do faturamento`,
                }))}
              />
            </CartaoGrafico>
          </div>

          <CartaoGrafico
            titulo="Para comer aqui × para levar"
            subtitulo="Parte dos pedidos de cada um"
            tabela={
              <table className="admin-tabela">
                <thead>
                  <tr>
                    <th>Consumo</th>
                    <th>Pedidos</th>
                    <th>Parte dos pedidos</th>
                    <th>Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.porConsumo.map((linha) => (
                    <tr key={linha.consumo}>
                      <td>{NOMES_CONSUMO[linha.consumo]}</td>
                      <td>{linha.pedidos.toLocaleString('pt-BR')}</td>
                      <td>{porcentagem(linha.pedidos, resumo.pedidos)}</td>
                      <td>{formatarCentavos(linha.faturamentoCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <BarraSegmentada
              descricao={relatorio.porConsumo
                .map(
                  (linha) =>
                    `${NOMES_CONSUMO[linha.consumo]}: ${porcentagem(linha.pedidos, resumo.pedidos)} dos pedidos`,
                )
                .join('; ')}
              partes={(['local', 'viagem', 'nao_informado'] as const)
                .map((chave) => relatorio.porConsumo.find((linha) => linha.consumo === chave))
                .filter((linha): linha is VendasPorConsumo => Boolean(linha))
                .map((linha) => ({
                  chave: linha.consumo,
                  rotulo: NOMES_CONSUMO[linha.consumo],
                  valor: linha.pedidos,
                  classe: CLASSES_CONSUMO[linha.consumo],
                  detalhe: `${plural(linha.pedidos, 'pedido', 'pedidos')} (${porcentagem(linha.pedidos, resumo.pedidos)}) · ${formatarCentavos(linha.faturamentoCentavos)}`,
                }))}
            />
          </CartaoGrafico>
        </>
      )}
    </section>
  );
}
