// Tipos referentes ao pedido/carrinho do cliente.
// Consumido por: apps/api/src/modules/carrinho, apps/totem/src/screens/Carrinho (US-02, US-03).

export interface ItemPedido {
  itemCardapioId: string;
  nome: string;
  quantidade: number;
  precoUnitarioCentavos: number;
  observacoes?: string;
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
  cupomAplicado?: string;
  valorTotalCentavos: number;
  criadoEm: string;
}
