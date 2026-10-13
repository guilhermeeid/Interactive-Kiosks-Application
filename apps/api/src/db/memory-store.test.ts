import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Cupom, Pedido } from '@totem/shared';
import { criarConfigPadrao } from './config-padrao';
import {
  calcularResultadoCupom,
  calcularSubtotal,
  calcularTotalFinal,
  config,
  cupons,
  obterOuCriarPedido,
  pedidos,
  recalcularPedido,
  reservarNumeroPedido,
} from './memory-store';

function pedidoComItens(itens: Pedido['itens']): Pedido {
  return {
    id: 'pedido-teste',
    itens,
    status: 'em_montagem',
    valorTotalCentavos: 0,
    descontoCupomCentavos: 0,
    descontoPontosCentavos: 0,
    valorAPagarCentavos: 0,
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

describe('recalcularPedido', () => {
  afterEach(() => {
    Object.assign(config, criarConfigPadrao());
  });

  const itens: Pedido['itens'] = [
    { itemCardapioId: 'a', nome: 'A', quantidade: 2, precoUnitarioCentavos: 2000 },
  ];

  it('abate primeiro o cupom e depois os pontos, separando cada desconto', () => {
    const pedido = pedidoComItens(itens);
    pedido.cupomAplicado = 'BEMVINDO10';
    pedido.pontosUsados = 500;
    recalcularPedido(pedido);

    expect(pedido.valorTotalCentavos).toBe(4000);
    expect(pedido.descontoCupomCentavos).toBe(400);
    expect(pedido.descontoPontosCentavos).toBe(500);
    expect(pedido.valorAPagarCentavos).toBe(3100);
  });

  it('converte pontos em dinheiro pela equivalência definida pelo administrador', () => {
    config.fidelidade.pontosPorReal = 10; // 10 pontos = R$ 1,00
    const pedido = pedidoComItens(itens);
    pedido.pontosUsados = 50;
    recalcularPedido(pedido);
    expect(pedido.descontoPontosCentavos).toBe(500);
  });

  it('nunca gasta mais pontos do que o necessário para zerar o pedido', () => {
    const pedido = pedidoComItens(itens);
    pedido.pontosUsados = 999999;
    recalcularPedido(pedido);
    expect(pedido.pontosUsados).toBe(4000);
    expect(pedido.valorAPagarCentavos).toBe(0);
  });

  it('ignora os pontos quando o programa de fidelidade está desligado', () => {
    config.fidelidade.habilitado = false;
    const pedido = pedidoComItens(itens);
    pedido.pontosUsados = 500;
    recalcularPedido(pedido);
    expect(pedido.pontosUsados).toBeUndefined();
    expect(pedido.valorAPagarCentavos).toBe(4000);
  });

  it('desfaz o cupom do pedido quando ele foi excluído pelo administrador', () => {
    cupons.set('TEMPORARIO', { codigo: 'TEMPORARIO', tipoDesconto: 'valor_fixo', valor: 100, ativo: true });
    const pedido = pedidoComItens(itens);
    pedido.cupomAplicado = 'TEMPORARIO';
    recalcularPedido(pedido);
    expect(pedido.valorAPagarCentavos).toBe(3900);

    cupons.delete('TEMPORARIO');
    recalcularPedido(pedido);
    expect(pedido.cupomAplicado).toBeUndefined();
    expect(pedido.valorAPagarCentavos).toBe(4000);
  });
});

describe('reservarNumeroPedido', () => {
  afterEach(() => {
    pedidos.clear();
  });

  function ocupar(numero: number, entregue = false): void {
    const pedido = pedidoComItens([]);
    pedido.id = `pedido-${numero}`;
    pedido.numero = String(numero);
    pedido.entregueEm = entregue ? new Date().toISOString() : undefined;
    pedidos.set(pedido.id, pedido);
  }

  it('sorteia um número de três dígitos', () => {
    expect(reservarNumeroPedido()).toMatch(/^[1-9]\d{2}$/);
  });

  it('não repete o número de um pedido em aberto e reaproveita o de um pedido entregue', () => {
    for (let numero = 100; numero <= 999; numero++) {
      ocupar(numero, numero === 555);
    }
    expect(reservarNumeroPedido()).toBe('555');
  });

  it('recusa quando todos os números estão em uso', () => {
    for (let numero = 100; numero <= 999; numero++) {
      ocupar(numero);
    }
    expect(() => reservarNumeroPedido()).toThrow(/número de pedido livre/);
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
