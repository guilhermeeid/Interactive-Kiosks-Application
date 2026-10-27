import { randomInt } from 'node:crypto';
import type {
  ClienteFidelidade,
  Comprovante,
  ConfigTotem,
  Cupom,
  ItemCardapio,
  ItemPedido,
  MudancaPendente,
  Pedido,
  RegistroConsentimento,
  ResultadoAplicacaoCupom,
} from '@totem/shared';
import { HttpError } from '../errors';
import { mesclarConfig } from './config-padrao';
import {
  anexarAuditoriaConsentimento,
  carregarAuditoriaConsentimento,
  carregarEstado,
  carregarRascunho,
  salvarEstado,
  salvarRascunho,
  type PendenciasLista,
  type RascunhoSalvo,
} from './persistencia';

// Armazenamento em memória usado como substituto temporário do Postgres, para o MVP
// rodar de ponta a ponta sem exigir o banco real no ar. O schema definitivo já está
// modelado em ../db/schema.ts e ../db/migrations.
// TODO: substituir estas estruturas por queries reais ao Postgres, mantendo os
// mesmos tipos de packages/shared para não exigir mudanças nos módulos de negócio.
// O que está em vigor e o que muda a cada venda é gravado em disco por `persistir()`;
// o que o Administrador salvou e ainda não está em vigor fica em `rascunho` e só é
// aplicado quando o processo reinicia (ver `aplicarRascunho`). Carrinhos ainda em
// montagem se perdem a cada reinício.

const salvo = carregarEstado();

export const config: ConfigTotem = mesclarConfig(salvo?.config);

export const itensCardapio: ItemCardapio[] = salvo?.itensCardapio ?? [
  {
    id: 'lanche-classico',
    nome: 'Lanche Clássico',
    descricao: 'Pão, hambúrguer, queijo, alface e tomate',
    categoria: 'lanches',
    precoCentavos: 1890,
    disponivel: true,
  },
  {
    id: 'lanche-duplo',
    nome: 'Lanche Duplo',
    descricao: 'Pão, dois hambúrgueres, queijo e bacon',
    categoria: 'lanches',
    precoCentavos: 2490,
    disponivel: true,
  },
  {
    id: 'batata-frita',
    nome: 'Batata Frita',
    descricao: 'Porção individual crocante',
    categoria: 'acompanhamentos',
    precoCentavos: 990,
    disponivel: true,
  },
  {
    id: 'refrigerante-lata',
    nome: 'Refrigerante (lata)',
    descricao: '350ml',
    categoria: 'bebidas',
    precoCentavos: 690,
    disponivel: true,
  },
  {
    id: 'suco-natural',
    nome: 'Suco Natural',
    descricao: '400ml',
    categoria: 'bebidas',
    precoCentavos: 890,
    // Esgotado: aparece no cardápio como indisponível e não pode ser adicionado.
    disponivel: false,
  },
];

export const pedidos = new Map<string, Pedido>(
  (salvo?.pedidos ?? []).map((pedido) => [pedido.id, pedido]),
);

// LGPD: dado pessoal — exige consentimento/criptografia (chave é o CPF do cliente)
// Cliente de demonstração: CPF 123.456.789-09, com saldo.
export const clientesFidelidade = new Map<string, ClienteFidelidade>(
  (
    salvo?.clientesFidelidade ?? [
      { id: 'cliente-demo', numeroFidelidade: '12345678909', pontos: 1250 },
    ]
  ).map((cliente) => [cliente.numeroFidelidade, cliente]),
);

export const comprovantes = new Map<string, Comprovante>();

export const cupons = new Map<string, Cupom>(
  (
    salvo?.cupons ?? [
      { codigo: 'BEMVINDO10', tipoDesconto: 'percentual', valor: 10, ativo: true },
      { codigo: 'DESC5', tipoDesconto: 'valor_fixo', valor: 500, ativo: true },
      // Cupons de exemplo para testar a vigência (US 24) no totem: VALIDO vale até 2099;
      // INVALIDO já expirou em 2020 e deve ser sempre recusado.
      {
        codigo: 'VALIDO',
        tipoDesconto: 'percentual',
        valor: 15,
        validoDe: '2026-01-01T00:00:00-03:00',
        validoAte: '2099-12-31T23:59:59-03:00',
        ativo: true,
      },
      {
        codigo: 'INVALIDO',
        tipoDesconto: 'percentual',
        valor: 15,
        validoDe: '2020-01-01T00:00:00-03:00',
        validoAte: '2020-12-31T23:59:59-03:00',
        ativo: true,
      },
    ]
  ).map((cupom) => [cupom.codigo, cupom]),
);

// US 29: trilha de auditoria do consentimento. Só recebe acréscimos; cada registro
// também vai para o arquivo de auditoria em disco no momento em que é criado.
export const registrosConsentimento: RegistroConsentimento[] = carregarAuditoriaConsentimento();

export function registrarAuditoriaConsentimento(registro: RegistroConsentimento): void {
  registrosConsentimento.push(registro);
  anexarAuditoriaConsentimento(registro);
}

// Grava em disco o estado que precisa sobreviver a um reinício. Dos pedidos, só os que
// seguram um número (no caixa, pagos ou ainda não entregues).
export function persistir(): void {
  salvarEstado({
    config,
    itensCardapio,
    cupons: [...cupons.values()],
    clientesFidelidade: [...clientesFidelidade.values()],
    pedidos: [...pedidos.values()].filter(pedidoAguardaRetirada),
  });
}

// ---------- Mudanças pendentes do Administrador ----------
// O Administrador muda tudo, mas o que ele salva só entra em vigor quando o servidor é
// reiniciado. O Funcionário muda só alguns campos dos produtos, e isso vale na hora.

function pendenciasVazias<T>(): PendenciasLista<T> {
  return { novos: [], alterados: {}, removidos: [] };
}

export const rascunho: RascunhoSalvo = {
  produtos: pendenciasVazias(),
  cupons: pendenciasVazias(),
};

export function persistirRascunho(): void {
  const vazio =
    !rascunho.config &&
    [rascunho.produtos, rascunho.cupons].every(
      (lista) =>
        lista.novos.length === 0 &&
        lista.removidos.length === 0 &&
        Object.keys(lista.alterados).length === 0,
    );
  salvarRascunho(vazio ? null : rascunho);
}

export function descartarRascunho(): void {
  rascunho.config = undefined;
  rascunho.produtos = pendenciasVazias();
  rascunho.cupons = pendenciasVazias();
  persistirRascunho();
}

// Aplica sobre um registro só os campos alterados (null = remover o campo).
export function aplicarAlteracoes<T extends object>(
  atual: T,
  alteracoes: Record<string, unknown>,
): T {
  const resultado = { ...atual } as Record<string, unknown>;
  for (const [campo, valor] of Object.entries(alteracoes)) {
    if (valor === null) {
      delete resultado[campo];
    } else {
      resultado[campo] = valor;
    }
  }
  return resultado as T;
}

// Campos em que `novo` difere de `atual` (null para os que deixaram de existir).
export function diferencas<T extends object>(atual: T, novo: T): Record<string, unknown> {
  const campos = new Set([...Object.keys(atual), ...Object.keys(novo)]);
  const mudou: Record<string, unknown> = {};
  for (const campo of campos) {
    const antes = (atual as Record<string, unknown>)[campo];
    const depois = (novo as Record<string, unknown>)[campo];
    if (JSON.stringify(antes) !== JSON.stringify(depois)) {
      mudou[campo] = depois === undefined ? null : depois;
    }
  }
  return mudou;
}

// Como a lista vai ficar depois do reinício, com a marca do que está pendente.
export function listaComPendencias<T extends object>(
  atuais: T[],
  chave: (registro: T) => string,
  pendencias: PendenciasLista<T>,
): (T & { pendente?: MudancaPendente })[] {
  const lista: (T & { pendente?: MudancaPendente })[] = atuais.map((registro) => {
    const id = chave(registro);
    if (pendencias.removidos.includes(id)) {
      return { ...registro, pendente: 'removido' };
    }
    const alteracoes = pendencias.alterados[id];
    return alteracoes ? { ...aplicarAlteracoes(registro, alteracoes), pendente: 'alterado' } : registro;
  });
  return [...lista, ...pendencias.novos.map((registro) => ({ ...registro, pendente: 'novo' as const }))];
}

function aplicarPendenciasLista<T extends object>(
  atuais: T[],
  chave: (registro: T) => string,
  pendencias: PendenciasLista<T>,
): T[] {
  return [
    ...atuais
      .filter((registro) => !pendencias.removidos.includes(chave(registro)))
      .map((registro) => {
        const alteracoes = pendencias.alterados[chave(registro)];
        return alteracoes ? aplicarAlteracoes(registro, alteracoes) : registro;
      }),
    ...pendencias.novos,
  ];
}

// Coloca em vigor tudo o que o Administrador deixou pendente. Roda uma vez, quando o
// servidor inicia; o rascunho é apagado em seguida.
export function aplicarRascunho(pendente: RascunhoSalvo): void {
  if (pendente.config) {
    Object.assign(config, mesclarConfig(pendente.config));
  }
  itensCardapio.splice(
    0,
    itensCardapio.length,
    ...aplicarPendenciasLista(itensCardapio, (item) => item.id, pendente.produtos),
  );
  // Os usos já contados de cada cupom continuam valendo: o administrador não os edita.
  const usos = new Map([...cupons.values()].map((cupom) => [cupom.codigo, cupom.usos]));
  const novosCupons = aplicarPendenciasLista([...cupons.values()], (c) => c.codigo, pendente.cupons);
  cupons.clear();
  for (const cupom of novosCupons) {
    cupons.set(cupom.codigo, { ...cupom, usos: usos.get(cupom.codigo) ?? cupom.usos });
  }
}

const rascunhoSalvo = carregarRascunho();
if (rascunhoSalvo) {
  aplicarRascunho(rascunhoSalvo);
  salvarRascunho(null);
  persistir();
}

// ---------- Pedido ----------

export function obterOuCriarPedido(pedidoId: string): Pedido {
  let pedido = pedidos.get(pedidoId);
  if (!pedido) {
    pedido = {
      id: pedidoId,
      itens: [],
      status: 'em_montagem',
      valorTotalCentavos: 0,
      descontoCupomCentavos: 0,
      descontoPontosCentavos: 0,
      valorAPagarCentavos: 0,
      criadoEm: new Date().toISOString(),
    };
    pedidos.set(pedidoId, pedido);
  }
  return pedido;
}

// Depois de pago (ou enviado ao caixa), o pedido não aceita mais itens, cupom, pontos
// nem troca de CPF.
export function exigirPedidoEmMontagem(pedido: Pedido): void {
  if (pedido.status !== 'em_montagem') {
    throw new HttpError(409, 'Este pedido já foi pago e não pode mais ser alterado');
  }
}

export function obterClienteDoPedido(pedido: Pedido): ClienteFidelidade | undefined {
  if (!pedido.clienteId) {
    return undefined;
  }
  return [...clientesFidelidade.values()].find((cliente) => cliente.id === pedido.clienteId);
}

// ---------- Itens, combos e estoque ----------

export function obterItem(id: string): ItemCardapio | undefined {
  return itensCardapio.find((item) => item.id === id);
}

// O que uma unidade do item consome do estoque: o próprio item ou, num combo, os itens
// que o compõem.
function partesDoItem(id: string): { itemCardapioId: string; quantidade: number }[] {
  return obterItem(id)?.componentes ?? [{ itemCardapioId: id, quantidade: 1 }];
}

// Quantas unidades de cada item (não combo) as linhas consomem, abrindo os combos.
export function demandaPorItem(
  linhas: Pick<ItemPedido, 'itemCardapioId' | 'quantidade'>[],
): Map<string, number> {
  const demanda = new Map<string, number>();
  for (const linha of linhas) {
    for (const parte of partesDoItem(linha.itemCardapioId)) {
      const atual = demanda.get(parte.itemCardapioId) ?? 0;
      demanda.set(parte.itemCardapioId, atual + parte.quantidade * linha.quantidade);
    }
  }
  return demanda;
}

// Primeiro item cujo estoque não comporta a demanda, para explicar a recusa.
export function itemSemEstoque(
  demanda: Map<string, number>,
): { item: ItemCardapio; restam: number } | undefined {
  for (const [id, unidades] of demanda) {
    const item = obterItem(id);
    if (item?.estoque !== undefined && unidades > item.estoque) {
      return { item, restam: item.estoque };
    }
  }
  return undefined;
}

// Unidades à venda do item. Num combo, quantos combos os itens dele ainda permitem
// montar; sem controle de quantidade em nenhum deles, `undefined`.
export function estoqueEfetivo(item: ItemCardapio): number | undefined {
  if (!item.componentes) {
    return item.estoque;
  }
  let maximo: number | undefined;
  for (const parte of item.componentes) {
    const estoque = obterItem(parte.itemCardapioId)?.estoque;
    if (estoque !== undefined) {
      const cabe = Math.floor(estoque / parte.quantidade);
      maximo = maximo === undefined ? cabe : Math.min(maximo, cabe);
    }
  }
  return maximo;
}

// US 26 / US 34: um item pode ser comprado se está disponível e, com controle de
// quantidade, ainda restam unidades. Um combo também precisa de todos os seus itens
// disponíveis: assim que um deles esgota, o combo esgota junto.
export function itemDisponivel(item: ItemCardapio): boolean {
  if (!item.disponivel) {
    return false;
  }
  if (item.componentes) {
    const componentesOk = item.componentes.every((parte) => {
      const componente = obterItem(parte.itemCardapioId);
      return componente !== undefined && itemDisponivel(componente);
    });
    if (!componentesOk) {
      return false;
    }
  }
  const estoque = estoqueEfetivo(item);
  return estoque === undefined || estoque > 0;
}

// Até quantas unidades da linha cabem no estoque, descontando o que as outras linhas do
// carrinho usam dos mesmos itens (ex.: batata avulsa + combo com batata).
function quantidadeMaximaDaLinha(pedido: Pedido, linha: ItemPedido): number | undefined {
  const outras = demandaPorItem(
    pedido.itens.filter((outra) => outra.itemCardapioId !== linha.itemCardapioId),
  );
  let maximo: number | undefined;
  for (const parte of partesDoItem(linha.itemCardapioId)) {
    const estoque = obterItem(parte.itemCardapioId)?.estoque;
    if (estoque !== undefined) {
      const sobra = estoque - (outras.get(parte.itemCardapioId) ?? 0);
      const cabe = Math.max(Math.floor(sobra / parte.quantidade), 0);
      maximo = maximo === undefined ? cabe : Math.min(maximo, cabe);
    }
  }
  return maximo;
}

export function calcularSubtotal(pedido: Pedido): number {
  return pedido.itens.reduce(
    (total, item) => total + item.precoUnitarioCentavos * item.quantidade,
    0,
  );
}

// ---------- Cupons ----------

function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Valor das linhas do pedido sobre as quais o cupom incide: todas, ou só as dos itens ou
// categorias a que o cupom está atrelado.
export function subtotalElegivel(pedido: Pedido, cupom: Cupom): number {
  const alvo = cupom.aplicaEm;
  return pedido.itens
    .filter((linha) => {
      if (!alvo) {
        return true;
      }
      if (alvo.tipo === 'itens') {
        return alvo.ids.includes(linha.itemCardapioId);
      }
      const categoria = obterItem(linha.itemCardapioId)?.categoria;
      return categoria !== undefined && alvo.ids.includes(categoria);
    })
    .reduce((total, linha) => total + linha.precoUnitarioCentavos * linha.quantidade, 0);
}

// Por que o cupom não serve para este pedido (pedido mínimo ou nenhum item participante),
// ou `undefined` se serve. Vigência e limite de usos ficam em modules/cupom.
export function motivoCupomNaoServe(pedido: Pedido, cupom: Cupom): string | undefined {
  if (cupom.pedidoMinimoCentavos && calcularSubtotal(pedido) < cupom.pedidoMinimoCentavos) {
    return `o cupom ${cupom.codigo} vale para pedidos a partir de ${formatarReais(cupom.pedidoMinimoCentavos)}`;
  }
  if (cupom.aplicaEm && subtotalElegivel(pedido, cupom) === 0) {
    const nomes =
      cupom.aplicaEm.tipo === 'itens'
        ? cupom.aplicaEm.ids.map((id) => obterItem(id)?.nome ?? id)
        : cupom.aplicaEm.ids.map((id) => config.categorias.find((c) => c.id === id)?.nome ?? id);
    return `o cupom ${cupom.codigo} vale só para ${nomes.join(', ')}`;
  }
  return undefined;
}

export function calcularResultadoCupom(pedido: Pedido, cupom: Cupom): ResultadoAplicacaoCupom {
  const subtotal = calcularSubtotal(pedido);
  const base = subtotalElegivel(pedido, cupom);
  let descontoCentavos =
    cupom.tipoDesconto === 'percentual'
      ? Math.round((base * cupom.valor) / 100)
      : Math.min(cupom.valor, base);
  // Teto do desconto (ex.: 10% limitado a R$ 50,00).
  if (cupom.descontoMaximoCentavos !== undefined) {
    descontoCentavos = Math.min(descontoCentavos, cupom.descontoMaximoCentavos);
  }

  return {
    cupom,
    descontoCentavos,
    valorTotalComDescontoCentavos: Math.max(subtotal - descontoCentavos, 0),
  };
}

// ---------- Pontos ----------

// Equivalência entre pontos de fidelidade e dinheiro, definida pelo administrador.
export function pontosParaCentavos(pontos: number): number {
  return Math.floor((pontos * 100) / config.fidelidade.pontosPorReal);
}

function pontosParaCobrir(centavos: number): number {
  return Math.ceil((centavos * config.fidelidade.pontosPorReal) / 100);
}

// Recalcula tudo o que é derivado do pedido: subtotal, descontos (cupom primeiro,
// pontos sobre o que sobra), valor a pagar e o limite de quantidade de cada linha.
// Deve ser chamada depois de qualquer mudança em itens, cupom ou pontos.
export function recalcularPedido(pedido: Pedido): void {
  for (const linha of pedido.itens) {
    linha.quantidadeMaxima = quantidadeMaximaDaLinha(pedido, linha);
  }
  pedido.valorTotalCentavos = calcularSubtotal(pedido);

  const cupom = pedido.cupomAplicado ? cupons.get(pedido.cupomAplicado) : undefined;
  if (pedido.cupomAplicado && !cupom) {
    // O cupom pode ter sido excluído pelo administrador depois de aplicado.
    pedido.cupomAplicado = undefined;
  }
  // O carrinho mudou e deixou de cumprir a regra do cupom: ele sai, com aviso.
  const motivo = cupom ? motivoCupomNaoServe(pedido, cupom) : undefined;
  if (cupom && motivo) {
    pedido.cupomAplicado = undefined;
    pedido.avisoCupom = `O cupom ${cupom.codigo} saiu do pedido: ${motivo}.`;
  }
  pedido.descontoCupomCentavos =
    cupom && !motivo ? calcularResultadoCupom(pedido, cupom).descontoCentavos : 0;

  // Nunca se gastam mais pontos do que o necessário para zerar o pedido.
  const restante = pedido.valorTotalCentavos - pedido.descontoCupomCentavos;
  const pontos = config.fidelidade.habilitado
    ? Math.min(pedido.pontosUsados ?? 0, pontosParaCobrir(restante))
    : 0;
  pedido.pontosUsados = pontos > 0 ? pontos : undefined;
  pedido.descontoPontosCentavos = Math.min(pontosParaCentavos(pontos), restante);

  pedido.valorAPagarCentavos = restante - pedido.descontoPontosCentavos;
}

export function calcularTotalFinal(pedido: Pedido): number {
  recalcularPedido(pedido);
  return pedido.valorAPagarCentavos;
}

// ---------- Número do pedido ----------

// Pedido que segura um número: no caixa, pago ou concluído e ainda não entregue.
export function pedidoAguardaRetirada(pedido: Pedido): boolean {
  return (
    pedido.numero !== undefined && pedido.entregueEm === undefined && pedido.status !== 'cancelado'
  );
}

// Sorteia um número de três dígitos que nenhum pedido em aberto esteja usando. O número
// só volta a ficar livre quando a entrega é confirmada ou o pedido é cancelado.
export function reservarNumeroPedido(): string {
  const emUso = new Set(
    [...pedidos.values()].filter(pedidoAguardaRetirada).map((pedido) => pedido.numero),
  );
  const livres: string[] = [];
  for (let numero = 100; numero <= 999; numero++) {
    if (!emUso.has(String(numero))) {
      livres.push(String(numero));
    }
  }
  if (livres.length === 0) {
    throw new HttpError(503, 'Não há número de pedido livre no momento. Chame um atendente.');
  }
  return livres[randomInt(livres.length)];
}
