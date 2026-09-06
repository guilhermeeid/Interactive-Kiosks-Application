import type { Pedido } from '@totem/shared';
import type {
  AdicionarItemCarrinhoBody,
  AtualizarItemCarrinhoBody,
  RemoverItemCarrinhoParams,
} from './carrinho.types';

// TODO: implementar US-02 (Adicionar ao carrinho) — validar disponibilidade do item
// de cardápio e persistir em itens_pedido.
export async function adicionarItem(body: AdicionarItemCarrinhoBody): Promise<Pedido> {
  throw new Error('adicionarItem não implementado');
}

// TODO: implementar US-03 (Revisar/editar carrinho) — alterar quantidade de um item.
export async function atualizarItem(body: AtualizarItemCarrinhoBody): Promise<Pedido> {
  throw new Error('atualizarItem não implementado');
}

// TODO: implementar US-03 (Revisar/editar carrinho) — remover item do pedido.
export async function removerItem(params: RemoverItemCarrinhoParams): Promise<Pedido> {
  throw new Error('removerItem não implementado');
}

// TODO: implementar US-03 (Revisar/editar carrinho) — retornar o estado atual do pedido.
export async function obterCarrinho(pedidoId: string): Promise<Pedido> {
  throw new Error('obterCarrinho não implementado');
}
