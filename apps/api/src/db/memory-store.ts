import type {
  ClienteFidelidade,
  Comprovante,
  Cupom,
  ItemCardapio,
  Pedido,
  ResultadoAplicacaoCupom,
} from '@totem/shared';

// Armazenamento em memória usado como substituto temporário do Postgres, para o MVP
// rodar de ponta a ponta sem exigir o banco real no ar. O schema definitivo já está
// modelado em ../db/schema.ts e ../db/migrations/0001_init.sql.
// TODO: substituir estas estruturas por queries reais ao Postgres, mantendo os
// mesmos tipos de packages/shared para não exigir mudanças nos módulos de negócio.
// Estado é perdido a cada reinício do processo.

export const itensCardapio: ItemCardapio[] = [
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
    disponivel: true,
  },
];

export const pedidos = new Map<string, Pedido>();

// LGPD: dado pessoal — exige consentimento/criptografia (chave é numeroFidelidade)
export const clientesFidelidade = new Map<string, ClienteFidelidade>();

export const comprovantes = new Map<string, Comprovante>();

export const cupons = new Map<string, Cupom>([
  ['BEMVINDO10', { codigo: 'BEMVINDO10', tipoDesconto: 'percentual', valor: 10, ativo: true }],
  ['DESC5', { codigo: 'DESC5', tipoDesconto: 'valor_fixo', valor: 500, ativo: true }],
]);

export function obterOuCriarPedido(pedidoId: string): Pedido {
  let pedido = pedidos.get(pedidoId);
  if (!pedido) {
    pedido = {
      id: pedidoId,
      itens: [],
      status: 'em_montagem',
      valorTotalCentavos: 0,
      criadoEm: new Date().toISOString(),
    };
    pedidos.set(pedidoId, pedido);
  }
  return pedido;
}

export function calcularSubtotal(pedido: Pedido): number {
  return pedido.itens.reduce(
    (total, item) => total + item.precoUnitarioCentavos * item.quantidade,
    0,
  );
}

export function recalcularSubtotal(pedido: Pedido): void {
  pedido.valorTotalCentavos = calcularSubtotal(pedido);
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

export function calcularTotalFinal(pedido: Pedido): number {
  const cupom = pedido.cupomAplicado ? cupons.get(pedido.cupomAplicado) : undefined;
  if (!cupom) {
    return calcularSubtotal(pedido);
  }
  return calcularResultadoCupom(pedido, cupom).valorTotalComDescontoCentavos;
}
