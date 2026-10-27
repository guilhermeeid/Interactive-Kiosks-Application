import { randomUUID } from 'node:crypto';
import type { ItemCardapio } from '@totem/shared';
import { describe, expect, it } from 'vitest';
import { itensCardapio } from '../../db/memory-store';
import { adicionarItem } from '../carrinho/carrinho.service';
import { listarCardapio } from './cardapio.service';

describe('listarCardapio', () => {
  it('retorna também os itens indisponíveis, marcados com disponivel: false', async () => {
    const itens = await listarCardapio({});
    const suco = itens.find((item) => item.id === 'suco-natural');
    expect(suco?.disponivel).toBe(false);
    expect(itens.some((item) => item.disponivel)).toBe(true);
  });

  it('filtra por categoria quando informada', async () => {
    const itens = await listarCardapio({ categoria: 'bebidas' });
    expect(itens.length).toBeGreaterThan(0);
    expect(itens.every((item) => item.categoria === 'bebidas')).toBe(true);
  });

  it('retorna lista vazia para categoria inexistente', async () => {
    const itens = await listarCardapio({ categoria: 'sobremesas' });
    expect(itens).toEqual([]);
  });

  // US-02
  it('busca por trecho do nome, ignorando maiúsculas e acentos', async () => {
    const itens = await listarCardapio({ busca: 'LANCHE' });
    expect(itens.map((item) => item.id)).toEqual(['lanche-classico', 'lanche-duplo']);
    expect(await listarCardapio({ busca: 'clássi' })).toHaveLength(1);
    expect(await listarCardapio({ busca: 'classi' })).toHaveLength(1);
  });

  it('combina busca com categoria', async () => {
    const itens = await listarCardapio({ categoria: 'bebidas', busca: 'suco' });
    expect(itens.map((item) => item.id)).toEqual(['suco-natural']);
    expect(await listarCardapio({ categoria: 'lanches', busca: 'suco' })).toEqual([]);
  });

  it('retorna lista vazia quando nenhum nome corresponde à busca', async () => {
    expect(await listarCardapio({ busca: 'pizza' })).toEqual([]);
  });

  it('ignora busca vazia ou só com espaços', async () => {
    const todos = await listarCardapio({});
    expect(await listarCardapio({ busca: '   ' })).toHaveLength(todos.length);
  });
});

// Item 13: combo listado com a disponibilidade e o estoque vindos dos itens dele.
describe('combos no cardápio', () => {
  function criar(dados: Partial<ItemCardapio>): ItemCardapio {
    const item: ItemCardapio = {
      id: `item-${randomUUID()}`,
      nome: 'Item',
      descricao: '',
      categoria: 'lanches',
      precoCentavos: 1000,
      disponivel: true,
      ...dados,
    };
    itensCardapio.push(item);
    return item;
  }
  const noCardapio = async (id: string) =>
    (await listarCardapio({})).find((item) => item.id === id);

  it('o estoque do combo é quantos combos os itens dele ainda permitem montar', async () => {
    const pao = criar({ estoque: 7 });
    const suco = criar({ estoque: 10 });
    const sem = criar({});
    const combo = criar({
      componentes: [
        { itemCardapioId: pao.id, quantidade: 2 },
        { itemCardapioId: suco.id, quantidade: 1 },
        { itemCardapioId: sem.id, quantidade: 1 },
      ],
    });
    expect((await noCardapio(combo.id))?.estoque).toBe(3); // 7 pães / 2 por combo
  });

  it('o combo esgota assim que qualquer item dele esgota, e volta junto', async () => {
    const lanche = criar({});
    const bebida = criar({ estoque: 1 });
    const combo = criar({
      componentes: [
        { itemCardapioId: lanche.id, quantidade: 1 },
        { itemCardapioId: bebida.id, quantidade: 1 },
      ],
    });
    expect((await noCardapio(combo.id))?.disponivel).toBe(true);

    lanche.disponivel = false; // o funcionário marcou o lanche como esgotado
    expect((await noCardapio(combo.id))?.disponivel).toBe(false);
    lanche.disponivel = true;
    bebida.estoque = 0;
    expect((await noCardapio(combo.id))?.disponivel).toBe(false);
    bebida.estoque = 4;
    expect((await noCardapio(combo.id))?.disponivel).toBe(true);
  });

  it('o carrinho soma o que o combo e os itens avulsos consomem do mesmo estoque', async () => {
    const batata = criar({ nome: 'Batata', estoque: 3 });
    const combo = criar({
      componentes: [
        { itemCardapioId: batata.id, quantidade: 2 },
        { itemCardapioId: 'refrigerante-lata', quantidade: 1 },
      ],
    });
    const pedidoId = randomUUID();
    const pedido = await adicionarItem({
      pedidoId,
      item: { itemCardapioId: combo.id, nome: 'Combo', quantidade: 1 },
    });
    // Sobra 1 batata para pedir avulsa.
    expect(pedido.itens[0].quantidadeMaxima).toBe(1);
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: batata.id, nome: 'Batata', quantidade: 1 },
    });
    await expect(
      adicionarItem({
        pedidoId,
        item: { itemCardapioId: batata.id, nome: 'Batata', quantidade: 1 },
      }),
    ).rejects.toThrow('Quantidade máxima atingida: só restam 3 unidades de Batata');
    await expect(
      adicionarItem({ pedidoId, item: { itemCardapioId: combo.id, nome: 'Combo', quantidade: 1 } }),
    ).rejects.toThrow(/Quantidade máxima atingida/);
  });
});
