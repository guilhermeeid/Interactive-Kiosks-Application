import type {
  AgrupamentoVendas,
  ConsumoPedido,
  FiltroRelatorioVendas,
  FormaPagamento,
  ItemVendido,
  Pedido,
  ProdutoMaisVendido,
  RelatorioVendas,
  Venda,
  VendasPorCategoria,
  VendasPorConsumo,
  VendasPorFormaPagamento,
} from '@totem/shared';
import { config, cupons, obterItem, vendas } from '../../db/memory-store';
import { HttpError } from '../../errors';

// US 25: relatório de vendas e mais vendidos.
// Cada venda é registrada no histórico quando o pagamento é aprovado (ver
// modules/pagamento). Os dias e as horas do relatório são os do fuso da loja.
const FUSO = 'America/Sao_Paulo';
// Até 62 dias o relatório agrupa por dia; acima disso, por mês.
const MAXIMO_DIAS_POR_DIA = 62;
const FORMAS: FormaPagamento[] = [
  'credito',
  'debito',
  'pix',
  'vale_refeicao',
  'vale_alimentacao',
  'dinheiro',
];
const CONSUMOS: ConsumoPedido[] = ['local', 'viagem'];

// ---------- Registro da venda ----------

// Divide `total` em partes proporcionais aos pesos, em centavos inteiros que somam
// exatamente o total (o que sobra do arredondamento vai para as maiores frações).
function ratear(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((acumulado, peso) => acumulado + peso, 0);
  if (total <= 0 || soma <= 0) {
    return pesos.map(() => 0);
  }
  const exatas = pesos.map((peso) => (total * peso) / soma);
  const partes = exatas.map(Math.floor);
  let resto = total - partes.reduce((acumulado, parte) => acumulado + parte, 0);
  const ordem = exatas
    .map((exata, indice) => ({ indice, fracao: exata - partes[indice] }))
    .sort((a, b) => b.fracao - a.fracao);
  for (const { indice } of ordem) {
    if (resto <= 0) break;
    partes[indice] += 1;
    resto -= 1;
  }
  return partes;
}

// O desconto do cupom cai só nos itens que o cupom alcança (item ou categoria); o dos
// pontos, em todos. Assim o faturamento por produto e por categoria fica fiel.
function descontosPorLinha(pedido: Pedido): number[] {
  const valores = pedido.itens.map((linha) => linha.precoUnitarioCentavos * linha.quantidade);
  const alvo = pedido.cupomAplicado ? cupons.get(pedido.cupomAplicado)?.aplicaEm : undefined;
  const elegiveis = pedido.itens.map((linha, indice) => {
    if (!alvo) return valores[indice];
    const alcanca =
      alvo.tipo === 'itens'
        ? alvo.ids.includes(linha.itemCardapioId)
        : alvo.ids.includes(obterItem(linha.itemCardapioId)?.categoria ?? '');
    return alcanca ? valores[indice] : 0;
  });
  const doCupom = ratear(pedido.descontoCupomCentavos, elegiveis);
  const restantes = valores.map((valor, indice) => valor - doCupom[indice]);
  const dosPontos = ratear(pedido.descontoPontosCentavos, restantes);
  return valores.map((_, indice) => doCupom[indice] + dosPontos[indice]);
}

// Foto da venda no momento do pagamento, sem dado pessoal do cliente.
export function vendaDoPedido(pedido: Pedido, pagaEm: Date): Venda {
  const descontos = descontosPorLinha(pedido);
  const itens = pedido.itens.map((linha, indice): ItemVendido => {
    const categoria = obterItem(linha.itemCardapioId)?.categoria ?? '';
    return {
      itemCardapioId: linha.itemCardapioId,
      nome: linha.nome,
      categoria,
      categoriaNome: config.categorias.find((c) => c.id === categoria)?.nome ?? 'Sem categoria',
      quantidade: linha.quantidade,
      valorCentavos: linha.precoUnitarioCentavos * linha.quantidade,
      descontoCentavos: descontos[indice],
    };
  });
  return {
    pedidoId: pedido.id,
    numero: pedido.numero ?? '',
    pagaEm: pagaEm.toISOString(),
    formaPagamento: pedido.formaPagamento ?? 'dinheiro',
    consumo: pedido.consumo,
    cupom: pedido.cupomAplicado,
    itens,
  };
}

// ---------- Datas no fuso da loja ----------

const partesDaData = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

export function diaEHora(iso: string): { dia: string; hora: string } {
  const partes = Object.fromEntries(
    partesDaData.formatToParts(new Date(iso)).map((parte) => [parte.type, parte.value]),
  );
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, hora: partes.hour };
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export function diaValido(valor: unknown, campo: string): string | undefined {
  if (valor === undefined || valor === '') {
    return undefined;
  }
  const data = typeof valor === 'string' && DIA.test(valor) ? new Date(`${valor}T00:00:00Z`) : null;
  if (!data || Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    throw new HttpError(400, `Data inválida em "${campo}" (use AAAA-MM-DD)`);
  }
  return valor;
}

// Dias de calendário, sem fuso: só aritmética de datas.
function somarDias(dia: string, dias: number): string {
  const data = new Date(`${dia}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

function chavesDoPeriodo(de: string, ate: string, agrupamento: AgrupamentoVendas): string[] {
  if (agrupamento === 'hora') {
    return Array.from({ length: 24 }, (_, hora) => `${de}T${String(hora).padStart(2, '0')}`);
  }
  if (agrupamento === 'dia') {
    return Array.from({ length: diasEntre(de, ate) + 1 }, (_, i) => somarDias(de, i));
  }
  const chaves: string[] = [];
  let [ano, mes] = de.slice(0, 7).split('-').map(Number);
  const fim = ate.slice(0, 7);
  for (;;) {
    const chave = `${ano}-${String(mes).padStart(2, '0')}`;
    chaves.push(chave);
    if (chave >= fim) break;
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return chaves;
}

function chaveDaVenda(venda: Venda, agrupamento: AgrupamentoVendas): string {
  const { dia, hora } = diaEHora(venda.pagaEm);
  if (agrupamento === 'hora') return `${dia}T${hora}`;
  return agrupamento === 'dia' ? dia : dia.slice(0, 7);
}

// ---------- Relatório ----------

function validarFiltro(entrada: Record<string, unknown> | undefined): FiltroRelatorioVendas {
  const de = diaValido(entrada?.de, 'De');
  const ate = diaValido(entrada?.ate, 'Até');
  if (de && ate && de > ate) {
    throw new HttpError(400, 'O início do período deve ser antes do fim');
  }
  const forma = entrada?.formaPagamento;
  if (forma !== undefined && forma !== '' && !FORMAS.includes(forma as FormaPagamento)) {
    throw new HttpError(400, 'Forma de pagamento inválida');
  }
  const consumo = entrada?.consumo;
  if (consumo !== undefined && consumo !== '' && !CONSUMOS.includes(consumo as ConsumoPedido)) {
    throw new HttpError(400, 'Consumo inválido');
  }
  const categoria = typeof entrada?.categoria === 'string' ? entrada.categoria : '';
  return {
    de,
    ate,
    categoria: categoria || undefined,
    formaPagamento: (forma || undefined) as FormaPagamento | undefined,
    consumo: (consumo || undefined) as ConsumoPedido | undefined,
  };
}

const liquido = (linha: ItemVendido) => linha.valorCentavos - linha.descontoCentavos;

// Nome atual da categoria, se ela ainda existe; senão, o da época da venda.
function nomeDaCategoria(id: string, nomeNaVenda: string): string {
  return config.categorias.find((categoria) => categoria.id === id)?.nome ?? nomeNaVenda;
}

function somarPor<K extends string, V>(
  mapa: Map<K, V>,
  chave: K,
  inicial: () => V,
  somar: (atual: V) => void,
): void {
  const atual = mapa.get(chave) ?? inicial();
  somar(atual);
  mapa.set(chave, atual);
}

export async function gerarRelatorioVendas(
  entrada?: Record<string, unknown>,
  agora: Date = new Date(),
): Promise<RelatorioVendas> {
  const filtro = validarFiltro(entrada);

  // Período, forma de pagamento e consumo escolhem as vendas; a categoria escolhe as
  // linhas dentro delas.
  const noPeriodo = vendas.filter((venda) => {
    const { dia } = diaEHora(venda.pagaEm);
    return (
      (!filtro.de || dia >= filtro.de) &&
      (!filtro.ate || dia <= filtro.ate) &&
      (!filtro.formaPagamento || venda.formaPagamento === filtro.formaPagamento) &&
      (!filtro.consumo || venda.consumo === filtro.consumo)
    );
  });

  const categorias = new Map<string, string>();
  for (const venda of noPeriodo) {
    for (const linha of venda.itens) {
      categorias.set(linha.categoria, nomeDaCategoria(linha.categoria, linha.categoriaNome));
    }
  }

  const selecionadas = noPeriodo
    .map((venda) => ({
      venda,
      linhas: filtro.categoria
        ? venda.itens.filter((linha) => linha.categoria === filtro.categoria)
        : venda.itens,
    }))
    .filter(({ linhas }) => linhas.length > 0);

  // Período efetivo: o escolhido; sem início, desde a primeira venda; sem fim, até hoje.
  const dias = selecionadas.map(({ venda }) => diaEHora(venda.pagaEm).dia).sort();
  const hoje = diaEHora(agora.toISOString()).dia;
  const de = filtro.de ?? dias[0] ?? null;
  const ate = filtro.ate ?? (filtro.de ? hoje : dias.at(-1)) ?? null;
  const agrupamento: AgrupamentoVendas =
    de && ate && de === ate
      ? 'hora'
      : de && ate && diasEntre(de, ate) > MAXIMO_DIAS_POR_DIA
        ? 'mes'
        : 'dia';

  const serie = new Map(
    (de && ate ? chavesDoPeriodo(de, ate, agrupamento) : []).map((chave) => [
      chave,
      { chave, faturamentoCentavos: 0, pedidos: 0 },
    ]),
  );
  const produtos = new Map<string, ProdutoMaisVendido>();
  const porCategoria = new Map<string, VendasPorCategoria>();
  const porForma = new Map<FormaPagamento, VendasPorFormaPagamento>();
  const porConsumo = new Map<ConsumoPedido | 'nao_informado', VendasPorConsumo>();
  let valorBruto = 0;
  let descontos = 0;
  let itensVendidos = 0;

  for (const { venda, linhas } of selecionadas) {
    const valorDoPedido = linhas.reduce((total, linha) => total + liquido(linha), 0);
    const ponto = serie.get(chaveDaVenda(venda, agrupamento));
    if (ponto) {
      ponto.faturamentoCentavos += valorDoPedido;
      ponto.pedidos += 1;
    }
    somarPor(
      porForma,
      venda.formaPagamento,
      () => ({ formaPagamento: venda.formaPagamento, pedidos: 0, faturamentoCentavos: 0 }),
      (total) => {
        total.pedidos += 1;
        total.faturamentoCentavos += valorDoPedido;
      },
    );
    const consumo = venda.consumo ?? 'nao_informado';
    somarPor(
      porConsumo,
      consumo,
      () => ({ consumo, pedidos: 0, faturamentoCentavos: 0 }),
      (total) => {
        total.pedidos += 1;
        total.faturamentoCentavos += valorDoPedido;
      },
    );

    for (const linha of linhas) {
      valorBruto += linha.valorCentavos;
      descontos += linha.descontoCentavos;
      itensVendidos += linha.quantidade;
      somarPor(
        produtos,
        linha.itemCardapioId,
        () => ({
          itemCardapioId: linha.itemCardapioId,
          nome: linha.nome,
          categoriaNome: nomeDaCategoria(linha.categoria, linha.categoriaNome),
          quantidade: 0,
          faturamentoCentavos: 0,
        }),
        (total) => {
          // O nome mais recente vence (o histórico vem em ordem de pagamento).
          total.nome = linha.nome;
          total.quantidade += linha.quantidade;
          total.faturamentoCentavos += liquido(linha);
        },
      );
      somarPor(
        porCategoria,
        linha.categoria,
        () => ({
          categoria: linha.categoria,
          nome: nomeDaCategoria(linha.categoria, linha.categoriaNome),
          quantidade: 0,
          faturamentoCentavos: 0,
        }),
        (total) => {
          total.quantidade += linha.quantidade;
          total.faturamentoCentavos += liquido(linha);
        },
      );
    }
  }

  const faturamento = valorBruto - descontos;
  const porFaturamento = <T extends { faturamentoCentavos: number }>(a: T, b: T) =>
    b.faturamentoCentavos - a.faturamentoCentavos;

  return {
    de,
    ate,
    agrupamento,
    resumo: {
      faturamentoCentavos: faturamento,
      valorBrutoCentavos: valorBruto,
      descontosCentavos: descontos,
      pedidos: selecionadas.length,
      itensVendidos,
      ticketMedioCentavos: selecionadas.length ? Math.round(faturamento / selecionadas.length) : 0,
    },
    serie: [...serie.values()],
    // Mais vendidos = mais unidades; empate, quem faturou mais.
    maisVendidos: [...produtos.values()].sort(
      (a, b) => b.quantidade - a.quantidade || b.faturamentoCentavos - a.faturamentoCentavos,
    ),
    porCategoria: [...porCategoria.values()].sort(porFaturamento),
    porFormaPagamento: [...porForma.values()].sort(porFaturamento),
    porConsumo: [...porConsumo.values()].sort(porFaturamento),
    categorias: [...categorias]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    totalDeVendas: vendas.length,
  };
}
