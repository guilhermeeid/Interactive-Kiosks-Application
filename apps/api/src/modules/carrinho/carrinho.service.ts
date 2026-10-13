import type { ItemCardapio, Pedido } from '@totem/shared';
import {
  exigirPedidoEmMontagem,
  itemDisponivel,
  itensCardapio,
  obterOuCriarPedido,
  recalcularPedido,
} from '../../db/memory-store';
import { HttpError } from '../../errors';
import type {
  AdicionarItemCarrinhoBody,
  AtualizarItemCarrinhoBody,
  RemoverItemCarrinhoParams,
} from './carrinho.types';

// Quantidade sempre inteira e nunca abaixo do mínimo: sem isso, um valor negativo
// geraria total negativo no pedido.
function exigirQuantidadeValida(quantidade: unknown, minimo: number): void {
  if (typeof quantidade !== 'number' || !Number.isInteger(quantidade) || quantidade < minimo) {
    throw new HttpError(400, 'Quantidade inválida');
  }
}

// Quando o administrador informa a quantidade à venda, o carrinho não passa dela.
function exigirEstoque(item: ItemCardapio, quantidade: number): void {
  if (item.estoque !== undefined && quantidade > item.estoque) {
    const restam = item.estoque === 1 ? 'só resta 1 unidade' : `só restam ${item.estoque} unidades`;
    throw new HttpError(400, `Quantidade máxima atingida: ${restam} de ${item.nome}`);
  }
}

// US-02: Adicionar ao carrinho — o preço/nome são sempre lidos do cardápio no
// servidor (nunca confiados do cliente), para evitar manipulação de preço.
export async function adicionarItem(body: AdicionarItemCarrinhoBody): Promise<Pedido> {
  exigirQuantidadeValida(body.item?.quantidade, 1);
  const pedido = obterOuCriarPedido(body.pedidoId);
  exigirPedidoEmMontagem(pedido);

  const itemCardapio = itensCardapio.find((item) => item.id === body.item.itemCardapioId);
  if (!itemCardapio) {
    throw new HttpError(400, `Item de cardápio "${body.item.itemCardapioId}" não encontrado`);
  }
  if (!itemDisponivel(itemCardapio)) {
    throw new HttpError(400, 'Item indisponível no momento');
  }

  const existente = pedido.itens.find((item) => item.itemCardapioId === itemCardapio.id);
  exigirEstoque(itemCardapio, (existente?.quantidade ?? 0) + body.item.quantidade);
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

  recalcularPedido(pedido);
  return pedido;
}

// US-03: Revisar/editar carrinho — altera a quantidade de um item já adicionado;
// quantidade 0 remove o item.
export async function atualizarItem(body: AtualizarItemCarrinhoBody): Promise<Pedido> {
  exigirQuantidadeValida(body.quantidade, 0);
  const pedido = obterOuCriarPedido(body.pedidoId);
  exigirPedidoEmMontagem(pedido);

  const item = pedido.itens.find((i) => i.itemCardapioId === body.itemCardapioId);
  if (!item) {
    throw new HttpError(404, `Item "${body.itemCardapioId}" não está no carrinho`);
  }

  if (body.quantidade === 0) {
    pedido.itens = pedido.itens.filter((i) => i.itemCardapioId !== body.itemCardapioId);
  } else {
    // Aumentar a quantidade passa pelas mesmas regras de adicionar (US 26).
    if (body.quantidade > item.quantidade) {
      const itemCardapio = itensCardapio.find((i) => i.id === body.itemCardapioId);
      if (!itemCardapio || !itemDisponivel(itemCardapio)) {
        throw new HttpError(400, 'Item indisponível no momento');
      }
      exigirEstoque(itemCardapio, body.quantidade);
    }
    item.quantidade = body.quantidade;
  }

  recalcularPedido(pedido);
  return pedido;
}

// US-03: Revisar/editar carrinho — remove um item do pedido.
export async function removerItem(params: RemoverItemCarrinhoParams): Promise<Pedido> {
  const pedido = obterOuCriarPedido(params.pedidoId);
  exigirPedidoEmMontagem(pedido);
  pedido.itens = pedido.itens.filter((item) => item.itemCardapioId !== params.itemCardapioId);
  recalcularPedido(pedido);
  return pedido;
}

// US-03: Revisar/editar carrinho — retorna o estado atual do pedido (cria um pedido
// vazio se ainda não existir, para o totem sempre ter um carrinho para exibir).
export async function obterCarrinho(pedidoId: string): Promise<Pedido> {
  const pedido = obterOuCriarPedido(pedidoId);
  // Estoque, cupom e pontos podem ter mudado desde a última alteração do carrinho.
  if (pedido.status === 'em_montagem') {
    recalcularPedido(pedido);
  }
  return pedido;
}
