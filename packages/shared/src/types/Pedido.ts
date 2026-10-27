// Tipos referentes ao pedido/carrinho do cliente.
// Consumido por: apps/api/src/modules/carrinho, apps/totem/src/screens/Carrinho (US-02, US-03).

import type { FinalidadeConsentimento } from './Consentimento';
import type { FormaPagamento } from './Pagamento';

export interface ItemPedido {
  itemCardapioId: string;
  nome: string;
  quantidade: number;
  precoUnitarioCentavos: number;
  observacoes?: string;
  // Até quantas unidades desta linha cabem no estoque, já descontando o que as outras
  // linhas do carrinho (inclusive combos) usam dos mesmos itens. Ausente = sem limite.
  // No totem, o "+" fica opaco ao atingi-lo.
  quantidadeMaxima?: number;
}

// `aguardando_pagamento`: pagamento em dinheiro, a ser feito no caixa com atendente.
export type StatusPedido =
  | 'em_montagem'
  | 'aguardando_pagamento'
  | 'pago'
  | 'finalizado'
  | 'cancelado';

// "Para comer aqui" ou "Para levar".
export type ConsumoPedido = 'local' | 'viagem';

export interface Pedido {
  id: string;
  itens: ItemPedido[];
  status: StatusPedido;
  clienteId?: string;
  cpfNaNota?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  // US 29: última decisão do cliente para cada finalidade neste pedido. Um dado pessoal
  // só é guardado se a finalidade dele estiver aqui como `true`; uma finalidade recusada
  // (`false`) não é perguntada de novo no mesmo pedido.
  consentimentos?: Partial<Record<FinalidadeConsentimento, boolean>>;
  cupomAplicado?: string;
  // O cupom saiu sozinho porque o carrinho deixou de cumprir a regra dele (ex.: pedido
  // mínimo); o totem mostra este aviso no carrinho.
  avisoCupom?: string;
  pontosUsados?: number; // pontos de fidelidade resgatados neste pedido
  // Valores sempre calculados no servidor; o totem só exibe.
  valorTotalCentavos: number; // soma dos itens, antes dos descontos
  descontoCupomCentavos: number;
  descontoPontosCentavos: number;
  valorAPagarCentavos: number;
  consumo?: ConsumoPedido;
  formaPagamento?: FormaPagamento;
  // Preenchidos quando o pagamento é aprovado (ou, em dinheiro, quando o pedido vai para
  // o caixa).
  numero?: string; // três dígitos; não se repete até a entrega ser confirmada
  pontosAcumulados?: number; // creditados ao cliente
  pontosPrevistos?: number; // dinheiro: creditados quando o caixa confirmar o pagamento
  entregueEm?: string;
  criadoEm: string;
}

// Pedido como o balcão e o caixa o veem (modo Funcionário).
export interface PedidoAguardandoRetirada {
  id: string;
  numero: string;
  status: StatusPedido;
  formaPagamento?: FormaPagamento;
  consumo?: ConsumoPedido;
  itens: Pick<ItemPedido, 'nome' | 'quantidade'>[];
  valorAPagarCentavos: number;
  criadoEm: string;
  // Só em pedido pago no caixa: o atendente emite a nota com este CPF.
  cpfNaNota?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  notaFiscalUrl?: string;
}
