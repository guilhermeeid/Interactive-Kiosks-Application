import { useState, type ReactNode } from 'react';

// Gráficos do relatório de vendas (US 25), desenhados em SVG/CSS, sem biblioteca.
// Regras seguidas: uma cor só por gráfico de uma série (azul), barras finas com a ponta
// arredondada e a base reta, grade em linhas finas e discretas, valor na ponta das
// barras deitadas, dica ao passar o mouse (ou focar com o teclado) e, em todo gráfico,
// a mesma informação em tabela.

// ---------- Cartão com título e "ver como tabela" ----------

export function CartaoGrafico({
  titulo,
  subtitulo,
  acoes,
  tabela,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
  tabela: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="relatorio-cartao">
      <figcaption className="relatorio-cartao__topo">
        <div>
          <h3>{titulo}</h3>
          {subtitulo && <small>{subtitulo}</small>}
        </div>
        {acoes}
      </figcaption>
      {children}
      <details className="relatorio-cartao__tabela">
        <summary>Ver como tabela</summary>
        {tabela}
      </details>
    </figure>
  );
}

// ---------- Colunas ao longo do tempo ----------

const LARGURA = 720;
const ALTURA = 260;
const MARGEM = { topo: 26, direita: 8, base: 26, esquerda: 64 };
const AREA_X = LARGURA - MARGEM.esquerda - MARGEM.direita;
const AREA_Y = ALTURA - MARGEM.topo - MARGEM.base;

// Topo "redondo" do eixo e o passo entre as linhas da grade (1, 2 ou 5 × 10^n).
function escala(maximo: number, linhas = 4): { topo: number; passo: number } {
  if (maximo <= 0) return { topo: linhas, passo: 1 };
  const bruto = maximo / linhas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto;
  return { topo: passo * Math.ceil(maximo / passo), passo };
}

// Barra em pé: ponta de cima arredondada (4), base reta.
function coluna(x: number, y: number, largura: number, altura: number): string {
  const r = Math.min(4, altura, largura / 2);
  const base = y + altura;
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + largura - r}Q${x + largura},${y} ${x + largura},${y + r}V${base}Z`;
}

export interface PontoColuna {
  rotulo: string; // eixo X (curto)
  rotuloCompleto: string; // dica e tabela
  valor: number;
  detalhe?: string; // segunda linha da dica
}

export function GraficoColunas({
  pontos,
  formatarEixo,
  formatarValor,
  descricao,
}: {
  pontos: PontoColuna[];
  formatarEixo: (valor: number) => string;
  formatarValor: (valor: number) => string;
  descricao: string; // nome acessível do gráfico
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const maximo = Math.max(0, ...pontos.map((ponto) => ponto.valor));
  const { topo, passo } = escala(maximo);
  const faixa = AREA_X / Math.max(pontos.length, 1);
  const larguraBarra = Math.min(24, faixa * 0.72);
  const y = (valor: number) => MARGEM.topo + AREA_Y - (valor / topo) * AREA_Y;
  // No máximo uns 12 rótulos no eixo X, para não encavalar.
  const cadaQuantos = Math.ceil(pontos.length / 12);
  const indiceDoPico = maximo > 0 ? pontos.findIndex((ponto) => ponto.valor === maximo) : -1;
  const linhasDaGrade = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
  const dica = ativo !== null ? pontos[ativo] : null;

  return (
    <div className="grafico-colunas" onPointerLeave={() => setAtivo(null)}>
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img" aria-label={descricao}>
        {linhasDaGrade.map((valor) => (
          <g key={valor}>
            <line
              className="grafico__grade"
              x1={MARGEM.esquerda}
              x2={LARGURA - MARGEM.direita}
              y1={y(valor)}
              y2={y(valor)}
            />
            <text
              className="grafico__eixo"
              x={MARGEM.esquerda - 8}
              y={y(valor) + 4}
              textAnchor="end"
            >
              {formatarEixo(valor)}
            </text>
          </g>
        ))}
        {pontos.map((ponto, indice) => {
          const x = MARGEM.esquerda + faixa * indice;
          const altura = (ponto.valor / topo) * AREA_Y;
          return (
            <g key={ponto.rotuloCompleto}>
              {altura > 0 && (
                <path
                  className={
                    indice === ativo ? 'grafico__barra grafico__barra--ativa' : 'grafico__barra'
                  }
                  d={coluna(x + (faixa - larguraBarra) / 2, y(ponto.valor), larguraBarra, altura)}
                />
              )}
              {indice === indiceDoPico && (
                <text
                  className="grafico__valor"
                  x={x + faixa / 2}
                  y={y(ponto.valor) - 8}
                  textAnchor="middle"
                >
                  {formatarValor(ponto.valor)}
                </text>
              )}
              {indice % cadaQuantos === 0 && (
                <text
                  className="grafico__eixo"
                  x={x + faixa / 2}
                  y={ALTURA - 8}
                  textAnchor="middle"
                >
                  {ponto.rotulo}
                </text>
              )}
              {/* Área de toque: a faixa inteira, não só a barra. */}
              <rect
                className="grafico__alvo"
                x={x}
                y={MARGEM.topo}
                width={faixa}
                height={AREA_Y}
                tabIndex={0}
                aria-label={`${ponto.rotuloCompleto}: ${formatarValor(ponto.valor)}${ponto.detalhe ? `, ${ponto.detalhe}` : ''}`}
                onPointerEnter={() => setAtivo(indice)}
                onFocus={() => setAtivo(indice)}
                onBlur={() => setAtivo(null)}
              />
            </g>
          );
        })}
        <line
          className="grafico__base"
          x1={MARGEM.esquerda}
          x2={LARGURA - MARGEM.direita}
          y1={MARGEM.topo + AREA_Y}
          y2={MARGEM.topo + AREA_Y}
        />
      </svg>
      {dica && ativo !== null && (
        <div
          className="grafico__dica"
          style={{
            left: `${((MARGEM.esquerda + faixa * (ativo + 0.5)) / LARGURA) * 100}%`,
            top: `${(y(dica.valor) / ALTURA) * 100}%`,
          }}
          role="status"
        >
          <strong>{formatarValor(dica.valor)}</strong>
          <span>
            {dica.rotuloCompleto}
            {dica.detalhe && ` · ${dica.detalhe}`}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------- Barras deitadas, da maior para a menor ----------

export interface LinhaBarra {
  chave: string;
  rotulo: string;
  valor: number;
  textoDoValor: string; // na ponta da barra
  detalhe?: string; // dica ao passar o mouse
}

export function BarrasDeitadas({ linhas, descricao }: { linhas: LinhaBarra[]; descricao: string }) {
  const maximo = Math.max(0, ...linhas.map((linha) => linha.valor));
  // Largura proporcional ao valor, sobre a mesma régua em todas as linhas; o valor fica
  // logo depois da ponta, num espaço reservado à direita.
  const largura = (valor: number) => (maximo > 0 ? `${(valor / maximo) * 100}%` : '0%');
  return (
    <ol className="barras-deitadas" aria-label={descricao}>
      {linhas.map((linha) => (
        <li
          key={linha.chave}
          className="barras-deitadas__linha"
          title={linha.detalhe ? `${linha.rotulo}: ${linha.detalhe}` : undefined}
        >
          <span className="barras-deitadas__rotulo">{linha.rotulo}</span>
          <span className="barras-deitadas__trilho">
            <span className="barras-deitadas__regua">
              <span className="barras-deitadas__barra" style={{ width: largura(linha.valor) }} />
              <span
                className="barras-deitadas__valor"
                style={{ left: `calc(${largura(linha.valor)} + 0.6rem)` }}
              >
                {linha.textoDoValor}
              </span>
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---------- Uma barra dividida em partes (o todo e cada parte) ----------

export interface ParteSegmentada {
  chave: string;
  rotulo: string;
  valor: number;
  classe: string; // cor da parte (ver admin.css)
  detalhe: string; // nome acessível e dica
}

export function BarraSegmentada({
  partes,
  descricao,
}: {
  partes: ParteSegmentada[];
  descricao: string;
}) {
  const total = partes.reduce((soma, parte) => soma + parte.valor, 0);
  const visiveis = partes.filter((parte) => parte.valor > 0);
  return (
    <div className="barra-segmentada">
      <div className="barra-segmentada__barra" role="img" aria-label={descricao}>
        {visiveis.map((parte) => {
          const fracao = total > 0 ? parte.valor / total : 0;
          return (
            <span
              key={parte.chave}
              className={`barra-segmentada__parte ${parte.classe}`}
              style={{ flexGrow: parte.valor }}
              title={`${parte.rotulo}: ${parte.detalhe}`}
            >
              {/* Só escreve a porcentagem onde ela cabe; o resto fica na legenda e na tabela. */}
              {fracao >= 0.12 && `${Math.round(fracao * 100)}%`}
            </span>
          );
        })}
      </div>
      <ul className="barra-segmentada__legenda">
        {visiveis.map((parte) => (
          <li key={parte.chave}>
            <span className={`barra-segmentada__amostra ${parte.classe}`} aria-hidden="true" />
            {parte.rotulo}
          </li>
        ))}
      </ul>
    </div>
  );
}
