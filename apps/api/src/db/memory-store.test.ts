import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Cupom, Pedido } from '@totem/shared';
import { calcularResultadoCupom, calcularSubtotal, calcularTotalFinal, obterOuCriarPedido } from './memory-store';

function pedidoComItens(itens: Pedido['itens']): Pedido {
  return {
    id: 'pedido-teste',
    itens,
    status: 'em_montagem',
    valorTotalCentavos: 0,
    criadoEm: new Date().toISOString(),
  };
}

describe('calcularSubtotal', () => {
  it('soma quantidade x preço unitário de cada item', () => {
    const pedido = pedidoComItens([
      { itemCardapioId: 'a', nome: 'A', quantidade: 2, precoUnitarioCentavos: 1000 },
      { itemCardapioId: 'b', nome: 'B', quantidade: 1, precoUnitarioCentavos: 500 },
    ]);
    expect(calcularSubtotal(pedido)).toBe(2500);
  });

  it('retorna 0 para carrinho vazio', () => {
    expect(calcularSubtotal(pedidoComItens([]))).toBe(0);
  });
});

describe('calcularResultadoCupom', () => {
  const pedido = pedidoComItens([
    { itemCardapioId: 'a', nome: 'A', quantidade: 1, precoUnitarioCentavos: 10000 },
  ]);

  it('aplica desconto percentual', () => {
    const cupom: Cupom = { codigo: 'P10', tipoDesconto: 'percentual', valor: 10, ativo: true };
    const resultado = calcularResultadoCupom(pedido, cupom);
    expect(resultado.descontoCentavos).toBe(1000);
    expect(resultado.valorTotalComDescontoCentavos).toBe(9000);
  });

  it('aplica desconto de valor fixo', () => {
    const cupom: Cupom = { codigo: 'F500', tipoDesconto: 'valor_fixo', valor: 500, ativo: true };
    const resultado = calcularResultadoCupom(pedido, cupom);
    expect(resultado.descontoCentavos).toBe(500);
    expect(resultado.valorTotalComDescontoCentavos).toBe(9500);
  });

  it('nunca deixa o total negativo quando o desconto fixo é maior que o subtotal', () => {
    const cupom: Cupom = { codigo: 'F999', tipoDesconto: 'valor_fixo', valor: 99999, ativo: true };
    const resultado = calcularResultadoCupom(pedido, cupom);
    expect(resultado.descontoCentavos).toBe(10000);
    expect(resultado.valorTotalComDescontoCentavos).toBe(0);
  });
});

describe('calcularTotalFinal', () => {
  it('retorna o subtotal quando não há cupom aplicado', () => {
    const pedido = pedidoComItens([
      { itemCardapioId: 'a', nome: 'A', quantidade: 1, precoUnitarioCentavos: 2000 },
    ]);
    expect(calcularTotalFinal(pedido)).toBe(2000);
  });
});

describe('obterOuCriarPedido', () => {
  it('cria um pedido vazio na primeira chamada e reutiliza o mesmo objeto depois', () => {
    const id = `pedido-${randomUUID()}`;
    const primeiro = obterOuCriarPedido(id);
    expect(primeiro.itens).toEqual([]);
    expect(primeiro.status).toBe('em_montagem');

    const segundo = obterOuCriarPedido(id);
    expect(segundo).toBe(primeiro);
  });
});
