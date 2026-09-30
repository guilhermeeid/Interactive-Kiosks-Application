import { describe, expect, it } from 'vitest';
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
