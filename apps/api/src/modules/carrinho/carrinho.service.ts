import type { ItemPedido, Pedido } from '@totem/shared';
import {
  demandaPorItem,
  exigirPedidoEmMontagem,
  itemDisponivel,
  itemSemEstoque,
  obterItem,
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

// Quando o administrador informa a quantidade à venda, o carrinho não passa dela. A
// conta é feita pelo carrinho inteiro: um combo consome os itens que o compõem, que
// também podem estar no carrinho avulsos.
function exigirEstoque(linhas: Pick<ItemPedido, 'itemCardapioId' | 'quantidade'>[]): void {
  const falta = itemSemEstoque(demandaPorItem(linhas));
  if (falta) {
    const restam = falta.restam === 1 ? 'só resta 1 unidade' : `só restam ${falta.restam} unidades`;
    throw new HttpError(400, `Quantidade máxima atingida: ${restam} de ${falta.item.nome}`);
  }
}

// O carrinho como ficaria com `quantidade` unidades do item (0 = sem o item).
function linhasCom(pedido: Pedido, itemCardapioId: string, quantidade: number) {
  const outras = pedido.itens.filter((linha) => linha.itemCardapioId !== itemCardapioId);
  return quantidade > 0 ? [...outras, { itemCardapioId, quantidade }] : outras;
}

// US-02: Adicionar ao carrinho — o preço/nome são sempre lidos do cardápio no
// servidor (nunca confiados do cliente), para evitar manipulação de preço.
export async function adicionarItem(body: AdicionarItemCarrinhoBody): Promise<Pedido> {
  exigirQuantidadeValida(body.item?.quantidade, 1);
  const pedido = obterOuCriarPedido(body.pedidoId);
  exigirPedidoEmMontagem(pedido);

  const itemCardapio = obterItem(body.item.itemCardapioId);
  if (!itemCardapio) {
    throw new HttpError(400, `Item de cardápio "${body.item.itemCardapioId}" não encontrado`);
  }
  if (!itemDisponivel(itemCardapio)) {
    throw new HttpError(400, 'Item indisponível no momento');
  }

  const existente = pedido.itens.find((item) => item.itemCardapioId === itemCardapio.id);
  const novaQuantidade = (existente?.quantidade ?? 0) + body.item.quantidade;
  exigirEstoque(linhasCom(pedido, itemCardapio.id, novaQuantidade));
  if (existente) {
    existente.quantidade = novaQuantidade;
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
      const itemCardapio = obterItem(body.itemCardapioId);
      if (!itemCardapio || !itemDisponivel(itemCardapio)) {
        throw new HttpError(400, 'Item indisponível no momento');
      }
      exigirEstoque(linhasCom(pedido, body.itemCardapioId, body.quantidade));
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
