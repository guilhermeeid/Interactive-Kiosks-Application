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
});
