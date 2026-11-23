// US 25: relatório de vendas e mais vendidos (área restrita, modo Administrador).
// Consumido por: apps/api/src/modules/relatorio, apps/totem/src/screens/Admin.

import type { FormaPagamento } from './Pagamento';
import type { ConsumoPedido } from './Pedido';

// Uma linha de produto dentro de uma venda. Nome e categoria são guardados como estavam
// na hora da venda, para o histórico não mudar quando o cardápio muda.
export interface ItemVendido {
  itemCardapioId: string;
  nome: string;
  categoria: string; // id da categoria
  categoriaNome: string;
  quantidade: number;
  valorCentavos: number; // quantidade × preço, antes dos descontos
  // Parte dos descontos do pedido (cupom e pontos) que coube a esta linha.
  descontoCentavos: number;
}

// Registrada quando o pagamento é aprovado (em dinheiro, quando o caixa confirma). Não
// guarda dado pessoal: nem CPF, nem cliente, nem contato.
export interface Venda {
  pedidoId: string;
  numero: string;
  pagaEm: string; // ISO
  formaPagamento: FormaPagamento;
  consumo?: ConsumoPedido;
  cupom?: string;
  itens: ItemVendido[];
}

export interface FiltroRelatorioVendas {
  de?: string; // AAAA-MM-DD, inclusive, no fuso da loja
  ate?: string;
  categoria?: string;
  formaPagamento?: FormaPagamento;
  consumo?: ConsumoPedido;
}

// Hora (período de um dia), dia (até 62 dias) ou mês (períodos maiores).
export type AgrupamentoVendas = 'hora' | 'dia' | 'mes';

export interface ResumoVendas {
  faturamentoCentavos: number; // o que entrou, depois dos descontos
  valorBrutoCentavos: number; // antes dos descontos
  descontosCentavos: number;
  pedidos: number;
  itensVendidos: number;
  ticketMedioCentavos: number;
}

export interface PontoSerieVendas {
  // AAAA-MM-DDTHH (hora), AAAA-MM-DD (dia) ou AAAA-MM (mês)
  chave: string;
  faturamentoCentavos: number;
  pedidos: number;
}

export interface ProdutoMaisVendido {
  itemCardapioId: string;
  nome: string;
  categoriaNome: string;
  quantidade: number;
  faturamentoCentavos: number;
}

export interface VendasPorCategoria {
  categoria: string;
  nome: string;
  quantidade: number;
  faturamentoCentavos: number;
}

export interface VendasPorFormaPagamento {
  formaPagamento: FormaPagamento;
  pedidos: number;
  faturamentoCentavos: number;
}

export interface VendasPorConsumo {
  consumo: ConsumoPedido | 'nao_informado';
  pedidos: number;
  faturamentoCentavos: number;
}

export interface RelatorioVendas {
  // Período efetivo do relatório; null quando não há venda nenhuma para mostrar.
  de: string | null;
  ate: string | null;
  agrupamento: AgrupamentoVendas;
  resumo: ResumoVendas;
  serie: PontoSerieVendas[]; // todos os pontos do período, inclusive os sem venda
  maisVendidos: ProdutoMaisVendido[];
  porCategoria: VendasPorCategoria[];
  porFormaPagamento: VendasPorFormaPagamento[];
  porConsumo: VendasPorConsumo[];
  // Categorias com venda no período (com os outros filtros), para o filtro de categoria.
  categorias: { id: string; nome: string }[];
  // Vendas registradas desde sempre: distingue "nada neste período" de "nada ainda".
  totalDeVendas: number;
}
