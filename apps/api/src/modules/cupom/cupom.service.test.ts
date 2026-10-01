import { randomUUID } from 'node:crypto';
import type { Cupom } from '@totem/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { calcularTotalFinal, cupons } from '../../db/memory-store';
import { HttpError } from '../../errors';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { aplicarCupom, validarVigenciaCupom } from './cupom.service';

describe('aplicarCupom', () => {
  it('aplica BEMVINDO10 (10%) sobre o subtotal do carrinho, aceitando código em minúsculas', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });

    const resultado = await aplicarCupom({ pedidoId, codigo: 'bemvindo10' });
    const descontoEsperado = Math.round(1890 * 0.1);
    expect(resultado.descontoCentavos).toBe(descontoEsperado);
    expect(resultado.valorTotalComDescontoCentavos).toBe(1890 - descontoEsperado);
  });

  // US 13: cupons de exemplo do seed (VALIDO até 2099; INVALIDO expirado em 2020).
  it('aplica o cupom de exemplo VALIDO e vincula o cupom ao pedido', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-duplo', nome: 'Lanche Duplo', quantidade: 2 },
    });

    const resultado = await aplicarCupom({ pedidoId, codigo: ' valido ' });
    expect(resultado.cupom.codigo).toBe('VALIDO');
    expect(resultado.descontoCentavos).toBe(Math.round(4980 * 0.15));
    expect(resultado.valorTotalComDescontoCentavos).toBe(4980 - Math.round(4980 * 0.15));
    expect((await obterCarrinho(pedidoId)).cupomAplicado).toBe('VALIDO');
  });

  it('recusa o cupom de exemplo INVALIDO (expirado) e o pedido segue sem desconto', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });

    await expect(aplicarCupom({ pedidoId, codigo: 'INVALIDO' })).rejects.toThrow(/expirado/);
    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.cupomAplicado).toBeUndefined();
    expect(calcularTotalFinal(pedido)).toBe(1890);
  });

  it('recusa código vazio ou só com espaços', async () => {
    const pedidoId = randomUUID();
    await expect(aplicarCupom({ pedidoId, codigo: '   ' })).rejects.toThrow(
      'Informe o código do cupom',
    );
    await expect(aplicarCupom({ pedidoId, codigo: '' })).rejects.toThrow(HttpError);
  });

  it('rejeita cupom inexistente', async () => {
    const pedidoId = randomUUID();
    await expect(aplicarCupom({ pedidoId, codigo: 'NAO-EXISTE' })).rejects.toThrow(HttpError);
  });
});

// US 24: regras de validade (vigência) do cupom.
describe('vigência do cupom', () => {
  const base: Cupom = { codigo: 'VIGENCIA', tipoDesconto: 'percentual', valor: 10, ativo: true };
  const inicio = '2026-10-01T00:00:00-03:00';
  const fim = '2026-10-31T23:59:59-03:00';

  afterEach(() => {
    cupons.delete('VIGENCIA');
  });

  it('aceita cupom dentro da vigência, inclusive nos limites de início e fim', () => {
    const cupom = { ...base, validoDe: inicio, validoAte: fim };
    expect(() => validarVigenciaCupom(cupom, new Date('2026-10-15T12:00:00-03:00'))).not.toThrow();
    expect(() => validarVigenciaCupom(cupom, new Date(inicio))).not.toThrow();
    expect(() => validarVigenciaCupom(cupom, new Date(fim))).not.toThrow();
  });

  it('recusa cupom antes da data de início, informando quando passa a valer', () => {
    const cupom = { ...base, validoDe: inicio, validoAte: fim };
    const antes = new Date('2026-09-30T23:59:59-03:00');
    expect(() => validarVigenciaCupom(cupom, antes)).toThrow(/ainda não está válido/);
    expect(() => validarVigenciaCupom(cupom, antes)).toThrow(/01\/10\/2026/);
  });

  it('recusa cupom expirado automaticamente', () => {
    const cupom = { ...base, validoDe: inicio, validoAte: fim };
    const depois = new Date('2026-11-01T00:00:00-03:00');
    expect(() => validarVigenciaCupom(cupom, depois)).toThrow(/expirado/);
  });

  it('sem datas, o cupom vale sempre; com só um lado, o outro fica sem limite', () => {
    const agora = new Date('2026-10-15T12:00:00-03:00');
    expect(() => validarVigenciaCupom(base, agora)).not.toThrow();
    expect(() => validarVigenciaCupom({ ...base, validoDe: inicio }, agora)).not.toThrow();
    expect(() => validarVigenciaCupom({ ...base, validoAte: fim }, agora)).not.toThrow();
  });

  it('recusa cupom desativado mesmo dentro da vigência', () => {
    const cupom = { ...base, ativo: false, validoDe: inicio, validoAte: fim };
    expect(() => validarVigenciaCupom(cupom, new Date('2026-10-15T12:00:00-03:00'))).toThrow(
      HttpError,
    );
  });

  it('aplicarCupom usa a vigência: aceita a partir do início e recusa antes e depois', async () => {
    cupons.set('VIGENCIA', { ...base, validoDe: inicio, validoAte: fim });
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });

    await expect(
      aplicarCupom({ pedidoId, codigo: 'VIGENCIA' }, new Date('2026-09-30T12:00:00-03:00')),
    ).rejects.toThrow(/ainda não está válido/);
    await expect(
      aplicarCupom({ pedidoId, codigo: 'VIGENCIA' }, new Date('2026-11-02T12:00:00-03:00')),
    ).rejects.toThrow(/expirado/);

    const resultado = await aplicarCupom(
      { pedidoId, codigo: 'vigencia' },
      new Date('2026-10-01T09:00:00-03:00'),
    );
    expect(resultado.descontoCentavos).toBe(Math.round(1890 * 0.1));
  });
});
