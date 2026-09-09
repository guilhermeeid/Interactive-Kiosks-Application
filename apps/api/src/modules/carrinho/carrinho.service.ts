import type { Pedido } from '@totem/shared';
import { itensCardapio, obterOuCriarPedido, recalcularSubtotal } from '../../db/memory-store';
import { HttpError } from '../../errors';
import type {
  AdicionarItemCarrinhoBody,
  AtualizarItemCarrinhoBody,
  RemoverItemCarrinhoParams,
} from './carrinho.types';

// US-02: Adicionar ao carrinho — o preço/nome são sempre lidos do cardápio no
// servidor (nunca confiados do cliente), para evitar manipulação de preço.
export async function adicionarItem(body: AdicionarItemCarrinhoBody): Promise<Pedido> {
  const pedido = obterOuCriarPedido(body.pedidoId);
  const itemCardapio = itensCardapio.find((item) => item.id === body.item.itemCardapioId);
  if (!itemCardapio || !itemCardapio.disponivel) {
    throw new HttpError(400, `Item de cardápio "${body.item.itemCardapioId}" indisponível`);
  }

  const existente = pedido.itens.find((item) => item.itemCardapioId === itemCardapio.id);
  if (existente) {
    existente.quantidade += body.item.quantidade;
  } else {
    pedido.itens.push({
      itemCardapioId: itemCardapio.id,
      nome: itemCardapio.nome,
      quantidade: body.item.quantidade,
      precoUnitarioCentavos: itemCardapio.precoCentavos,
      observacoes: body.item.observacoes,
    });
  }

  recalcularSubtotal(pedido);
  return pedido;
}

// US-03: Revisar/editar carrinho — altera a quantidade de um item já adicionado;
// quantidade <= 0 remove o item.
export async function atualizarItem(body: AtualizarItemCarrinhoBody): Promise<Pedido> {
  const pedido = obterOuCriarPedido(body.pedidoId);
  const item = pedido.itens.find((i) => i.itemCardapioId === body.itemCardapioId);
  if (!item) {
    throw new HttpError(404, `Item "${body.itemCardapioId}" não está no carrinho`);
  }

  if (body.quantidade <= 0) {
    pedido.itens = pedido.itens.filter((i) => i.itemCardapioId !== body.itemCardapioId);
  } else {
    item.quantidade = body.quantidade;
  }

  recalcularSubtotal(pedido);
  return pedido;
}

// US-03: Revisar/editar carrinho — remove um item do pedido.
export async function removerItem(params: RemoverItemCarrinhoParams): Promise<Pedido> {
  const pedido = obterOuCriarPedido(params.pedidoId);
  pedido.itens = pedido.itens.filter((item) => item.itemCardapioId !== params.itemCardapioId);
  recalcularSubtotal(pedido);
  return pedido;
}

// US-03: Revisar/editar carrinho — retorna o estado atual do pedido (cria um pedido
// vazio se ainda não existir, para o totem sempre ter um carrinho para exibir).
export async function obterCarrinho(pedidoId: string): Promise<Pedido> {
  return obterOuCriarPedido(pedidoId);
}
