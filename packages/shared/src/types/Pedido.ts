// Tipos referentes ao pedido/carrinho do cliente.
// Consumido por: apps/api/src/modules/carrinho, apps/totem/src/screens/Carrinho (US-02, US-03).

import type { FinalidadeConsentimento } from './Consentimento';

export interface ItemPedido {
  itemCardapioId: string;
  nome: string;
  quantidade: number;
  precoUnitarioCentavos: number;
  observacoes?: string;
  // Estoque do item no cardápio; ausente = sem limite. No totem, o "+" fica opaco ao atingi-lo.
  quantidadeMaxima?: number;
}

export type StatusPedido =
  | 'em_montagem'
  | 'aguardando_pagamento'
  | 'pago'
  | 'finalizado'
  | 'cancelado';

export interface Pedido {
  id: string;
  itens: ItemPedido[];
  status: StatusPedido;
  clienteId?: string;
  cpfNaNota?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  // US 29: última decisão do cliente para cada finalidade neste pedido. Um dado pessoal
  // só é guardado se a finalidade dele estiver aqui como `true`.
  consentimentos?: Partial<Record<FinalidadeConsentimento, boolean>>;
  // US 10: o cliente pulou a identificação; nenhum dado pessoal é pedido nem aceito de
  // novo neste pedido.
  semDadosPessoais?: boolean;
  cupomAplicado?: string;
  pontosUsados?: number; // pontos de fidelidade resgatados neste pedido
  // Valores sempre calculados no servidor; o totem só exibe.
  valorTotalCentavos: number; // soma dos itens, antes dos descontos
  descontoCupomCentavos: number;
  descontoPontosCentavos: number;
  valorAPagarCentavos: number;
  // Preenchidos quando o pagamento é aprovado.
  numero?: string; // três dígitos; não se repete até a entrega ser confirmada
  pontosAcumulados?: number;
  entregueEm?: string;
  criadoEm: string;
}

// Pedido pago que ainda espera o "ok" do balcão (tela de administrador).
export interface PedidoAguardandoRetirada {
  id: string;
  numero: string;
  itens: Pick<ItemPedido, 'nome' | 'quantidade'>[];
  valorAPagarCentavos: number;
  criadoEm: string;
}
