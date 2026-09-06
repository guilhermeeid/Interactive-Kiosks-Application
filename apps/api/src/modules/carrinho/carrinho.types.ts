import type { ItemPedido, Pedido } from '@totem/shared';

// DTOs específicos do módulo de carrinho (Épico 1).
export interface AdicionarItemCarrinhoBody {
  pedidoId: string;
  item: Omit<ItemPedido, 'precoUnitarioCentavos'> & { precoUnitarioCentavos?: number };
}

export interface AtualizarItemCarrinhoBody {
  pedidoId: string;
  itemCardapioId: string;
  quantidade: number;
}

export interface RemoverItemCarrinhoParams {
  pedidoId: string;
  itemCardapioId: string;
}

export type CarrinhoResponse = Pedido;
