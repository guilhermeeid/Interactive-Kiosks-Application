import { randomInt } from 'node:crypto';
import type {
  ClienteFidelidade,
  Comprovante,
  ConfigTotem,
  Cupom,
  ItemCardapio,
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
  salvarEstado,
} from './persistencia';

// Armazenamento em memória usado como substituto temporário do Postgres, para o MVP
// rodar de ponta a ponta sem exigir o banco real no ar. O schema definitivo já está
// modelado em ../db/schema.ts e ../db/migrations.
// TODO: substituir estas estruturas por queries reais ao Postgres, mantendo os
// mesmos tipos de packages/shared para não exigir mudanças nos módulos de negócio.
// O que o administrador configura e o que muda a cada venda é gravado em disco por
// `persistir()` (ver ./persistencia.ts); carrinhos ainda em montagem se perdem a cada
// reinício do processo.

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
// seguram um número (pagos e ainda não entregues).
export function persistir(): void {
  salvarEstado({
    config,
    itensCardapio,
    cupons: [...cupons.values()],
    clientesFidelidade: [...clientesFidelidade.values()],
    pedidos: [...pedidos.values()].filter(pedidoAguardaRetirada),
  });
}

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

// Depois de pago, o pedido não aceita mais itens, cupom, pontos nem troca de CPF.
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

// US 26: um item pode ser comprado se o administrador o deixou disponível e, quando há
// controle de quantidade, ainda restam unidades.
export function itemDisponivel(item: ItemCardapio): boolean {
  return item.disponivel && (item.estoque === undefined || item.estoque > 0);
}

export function calcularSubtotal(pedido: Pedido): number {
  return pedido.itens.reduce(
    (total, item) => total + item.precoUnitarioCentavos * item.quantidade,
    0,
  );
}

export function calcularResultadoCupom(pedido: Pedido, cupom: Cupom): ResultadoAplicacaoCupom {
  const subtotal = calcularSubtotal(pedido);
  const descontoCentavos =
    cupom.tipoDesconto === 'percentual'
      ? Math.round((subtotal * cupom.valor) / 100)
      : Math.min(cupom.valor, subtotal);

  return {
    cupom,
    descontoCentavos,
    valorTotalComDescontoCentavos: Math.max(subtotal - descontoCentavos, 0),
  };
}

// Equivalência entre pontos de fidelidade e dinheiro, definida pelo administrador.
export function pontosParaCentavos(pontos: number): number {
  return Math.floor((pontos * 100) / config.fidelidade.pontosPorReal);
}

function pontosParaCobrir(centavos: number): number {
  return Math.ceil((centavos * config.fidelidade.pontosPorReal) / 100);
}

// Recalcula tudo o que é derivado do pedido: subtotal, descontos (cupom primeiro,
// pontos sobre o que sobra), valor a pagar e o limite de quantidade de cada item.
// Deve ser chamada depois de qualquer mudança em itens, cupom ou pontos.
export function recalcularPedido(pedido: Pedido): void {
  for (const item of pedido.itens) {
    item.quantidadeMaxima = itensCardapio.find((i) => i.id === item.itemCardapioId)?.estoque;
  }
  pedido.valorTotalCentavos = calcularSubtotal(pedido);

  const cupom = pedido.cupomAplicado ? cupons.get(pedido.cupomAplicado) : undefined;
  if (!cupom) {
    // O cupom pode ter sido excluído pelo administrador depois de aplicado.
    pedido.cupomAplicado = undefined;
  }
  pedido.descontoCupomCentavos = cupom
    ? calcularResultadoCupom(pedido, cupom).descontoCentavos
    : 0;

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

export function pedidoAguardaRetirada(pedido: Pedido): boolean {
  return pedido.numero !== undefined && pedido.entregueEm === undefined;
}

// Sorteia um número de três dígitos que nenhum pedido em aberto esteja usando. O número
// só volta a ficar livre quando a entrega do pedido é confirmada (tela de administrador).
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
