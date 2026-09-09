import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../../errors';
import { adicionarItem, atualizarItem, obterCarrinho, removerItem } from './carrinho.service';

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
});

describe('atualizarItem', () => {
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
      item: { itemCardapioId: 'suco-natural', nome: 'Suco Natural', quantidade: 1 },
    });
    const pedido = await removerItem({ pedidoId, itemCardapioId: 'suco-natural' });
    expect(pedido.itens).toEqual([]);
  });
});
