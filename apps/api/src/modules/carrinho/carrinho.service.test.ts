import { randomUUID } from 'node:crypto';
import type { ItemCardapio } from '@totem/shared';
import { describe, expect, it } from 'vitest';
import { itensCardapio } from '../../db/memory-store';
import { HttpError } from '../../errors';
import { adicionarItem, atualizarItem, obterCarrinho, removerItem } from './carrinho.service';

// Cadastra no cardápio um item com quantidade controlada pelo administrador.
function criarItemComEstoque(estoque: number): ItemCardapio {
  const item: ItemCardapio = {
    id: `item-${randomUUID()}`,
    nome: 'Torta do dia',
    descricao: '',
    categoria: 'sobremesas',
    precoCentavos: 1200,
    estoque,
    disponivel: true,
  };
  itensCardapio.push(item);
  return item;
}

describe('adicionarItem', () => {
  it('cria o item na primeira chamada e soma a quantidade na segunda', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });
    const pedido = await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 2 },
    });

    expect(pedido.itens).toHaveLength(1);
    expect(pedido.itens[0].quantidade).toBe(3);
    expect(pedido.valorTotalCentavos).toBe(3 * 1890);
  });

  it('rejeita item de cardápio inexistente', async () => {
    const pedidoId = randomUUID();
    await expect(
      adicionarItem({ pedidoId, item: { itemCardapioId: 'nao-existe', nome: 'X', quantidade: 1 } }),
    ).rejects.toThrow(HttpError);
  });

  it('rejeita item indisponível com a mensagem "Item indisponível no momento"', async () => {
    const pedidoId = randomUUID();
    await expect(
      adicionarItem({
        pedidoId,
        item: { itemCardapioId: 'suco-natural', nome: 'Suco Natural', quantidade: 1 },
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Item indisponível no momento' });

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.itens).toEqual([]);
  });

  it('rejeita quantidade negativa, zero ou fracionada, sem alterar o pedido', async () => {
    const pedidoId = randomUUID();
    for (const quantidade of [-3, 0, 1.5, Number.NaN]) {
      await expect(
        adicionarItem({
          pedidoId,
          item: { itemCardapioId: 'batata-frita', nome: 'Batata Frita', quantidade },
        }),
      ).rejects.toMatchObject({ statusCode: 400, message: 'Quantidade inválida' });
    }

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.itens).toEqual([]);
    expect(pedido.valorTotalCentavos).toBe(0);
  });

  it('não deixa o carrinho passar da quantidade que o administrador pôs à venda', async () => {
    const item = criarItemComEstoque(2);
    const pedidoId = randomUUID();
    const pedido = await adicionarItem({
      pedidoId,
      item: { itemCardapioId: item.id, nome: item.nome, quantidade: 2 },
    });
    expect(pedido.itens[0].quantidadeMaxima).toBe(2);

    await expect(
      adicionarItem({ pedidoId, item: { itemCardapioId: item.id, nome: item.nome, quantidade: 1 } }),
    ).rejects.toThrow(/Quantidade máxima atingida/);
    expect((await obterCarrinho(pedidoId)).itens[0].quantidade).toBe(2);
  });

  it('trata item com quantidade zerada como indisponível', async () => {
    const item = criarItemComEstoque(0);
    await expect(
      adicionarItem({
        pedidoId: randomUUID(),
        item: { itemCardapioId: item.id, nome: item.nome, quantidade: 1 },
      }),
    ).rejects.toThrow('Item indisponível no momento');
  });
});

describe('atualizarItem', () => {
  it('altera a quantidade e recalcula o total do pedido', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });
    const pedido = await atualizarItem({
      pedidoId,
      itemCardapioId: 'lanche-classico',
      quantidade: 5,
    });
    expect(pedido.itens[0].quantidade).toBe(5);
    expect(pedido.valorTotalCentavos).toBe(5 * 1890);
    expect(pedido.valorAPagarCentavos).toBe(5 * 1890);
  });

  it('rejeita quantidade negativa', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'batata-frita', nome: 'Batata Frita', quantidade: 1 },
    });
    await expect(
      atualizarItem({ pedidoId, itemCardapioId: 'batata-frita', quantidade: -1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('não aumenta além do estoque nem de um item que ficou indisponível', async () => {
    const item = criarItemComEstoque(3);
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: item.id, nome: item.nome, quantidade: 1 },
    });

    await expect(
      atualizarItem({ pedidoId, itemCardapioId: item.id, quantidade: 4 }),
    ).rejects.toThrow(/só restam 3 unidades/);

    item.disponivel = false;
    await expect(
      atualizarItem({ pedidoId, itemCardapioId: item.id, quantidade: 2 }),
    ).rejects.toThrow('Item indisponível no momento');
  });

  it('remove o item quando a quantidade atualizada é <= 0', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'batata-frita', nome: 'Batata Frita', quantidade: 2 },
    });
    const pedido = await atualizarItem({ pedidoId, itemCardapioId: 'batata-frita', quantidade: 0 });
    expect(pedido.itens).toEqual([]);
  });

  it('lança erro 404 ao atualizar item que não está no carrinho', async () => {
    const pedidoId = randomUUID();
    await expect(
      atualizarItem({ pedidoId, itemCardapioId: 'batata-frita', quantidade: 1 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('obterCarrinho', () => {
  it('cria um carrinho vazio para um pedido novo', async () => {
    const pedido = await obterCarrinho(randomUUID());
    expect(pedido.itens).toEqual([]);
  });
});

describe('removerItem', () => {
  it('tira o item do pedido', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'refrigerante-lata', nome: 'Refrigerante (lata)', quantidade: 1 },
    });
    const pedido = await removerItem({ pedidoId, itemCardapioId: 'refrigerante-lata' });
    expect(pedido.itens).toEqual([]);
    expect(pedido.valorTotalCentavos).toBe(0);
  });
});
