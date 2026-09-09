import { describe, expect, it } from 'vitest';
import { listarCardapio } from './cardapio.service';

describe('listarCardapio', () => {
  it('retorna apenas itens disponíveis quando nenhum filtro é aplicado', async () => {
    const itens = await listarCardapio({});
    expect(itens.length).toBeGreaterThan(0);
    expect(itens.every((item) => item.disponivel)).toBe(true);
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
