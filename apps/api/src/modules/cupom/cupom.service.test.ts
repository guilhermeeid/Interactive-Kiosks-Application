import { randomUUID } from 'node:crypto';
import type { Cupom } from '@totem/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { criarConfigPadrao } from '../../db/config-padrao';
import { calcularTotalFinal, config, cupons } from '../../db/memory-store';
import { HttpError } from '../../errors';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { registrarConsentimentos } from '../consentimento/consentimento.service';
import { VERSAO_TERMO } from '../consentimento/termo';
import { informarFidelidade, usarPontos } from '../identificacao/identificacao.service';
import {
  aplicarCupom,
  removerCupom,
  situacaoCupom,
  validarCupom,
  validarVigenciaCupom,
} from './cupom.service';

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

  it('deixa no pedido o desconto e o valor a pagar, já calculados', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 2 },
    });
    await aplicarCupom({ pedidoId, codigo: 'DESC5' });

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.valorTotalCentavos).toBe(3780);
    expect(pedido.descontoCupomCentavos).toBe(500);
    expect(pedido.valorAPagarCentavos).toBe(3280);
  });
});

// US 13: código inválido ou expirado mantém o valor que o pedido tinha.
describe('cupom recusado não altera o pedido', () => {
  it('pedido sem cupom continua com o valor original', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });

    for (const codigo of ['NAOEXISTE', 'INVALIDO']) {
      await expect(aplicarCupom({ pedidoId, codigo })).rejects.toMatchObject({ statusCode: 400 });
    }
    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.cupomAplicado).toBeUndefined();
    expect(pedido.descontoCupomCentavos).toBe(0);
    expect(pedido.valorAPagarCentavos).toBe(1890);
  });

  it('pedido que já tinha cupom válido continua com ele', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });
    await aplicarCupom({ pedidoId, codigo: 'DESC5' });

    await expect(aplicarCupom({ pedidoId, codigo: 'INVALIDO' })).rejects.toThrow(/expirado/);
    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.cupomAplicado).toBe('DESC5');
    expect(pedido.valorAPagarCentavos).toBe(1890 - 500);
  });
});

// US 14
describe('trocar de cupom', () => {
  it('novo cupom válido substitui o desconto anterior, sem somar os dois', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-duplo', nome: 'Lanche Duplo', quantidade: 2 },
    });
    await aplicarCupom({ pedidoId, codigo: 'DESC5' });
    expect((await obterCarrinho(pedidoId)).valorAPagarCentavos).toBe(4980 - 500);

    const resultado = await aplicarCupom({ pedidoId, codigo: 'BEMVINDO10' });
    expect(resultado.descontoCentavos).toBe(498);

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.cupomAplicado).toBe('BEMVINDO10');
    expect(pedido.descontoCupomCentavos).toBe(498);
    expect(pedido.valorAPagarCentavos).toBe(4980 - 498);
  });
});

// US 14
describe('removerCupom', () => {
  it('restaura o valor integral do pedido', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });
    await aplicarCupom({ pedidoId, codigo: 'DESC5' });

    const pedido = await removerCupom(pedidoId);
    expect(pedido.cupomAplicado).toBeUndefined();
    expect(pedido.descontoCupomCentavos).toBe(0);
    expect(pedido.valorAPagarCentavos).toBe(1890);
  });
});

// Regras definidas pelo administrador: cupons desligados, limite de usos e soma com pontos.
describe('regras do administrador para cupons', () => {
  afterEach(() => {
    Object.assign(config, criarConfigPadrao());
  });

  it('recusa qualquer cupom quando o administrador desligou os cupons', async () => {
    config.cuponsHabilitados = false;
    await expect(aplicarCupom({ pedidoId: randomUUID(), codigo: 'DESC5' })).rejects.toThrow(
      'Cupons não estão sendo aceitos no momento',
    );
  });

  it('recusa cupom que já atingiu a quantidade de usos', () => {
    const cupom: Cupom = {
      codigo: 'LIMITADO',
      tipoDesconto: 'percentual',
      valor: 10,
      limiteUsos: 2,
      usos: 1,
      ativo: true,
    };
    expect(() => validarCupom(cupom)).not.toThrow();
    expect(() => validarCupom({ ...cupom, usos: 2 })).toThrow(/esgotado/);
  });

  it('recusa cupom em pedido com pontos quando o administrador não permite somar', async () => {
    config.fidelidade.combinaComCupom = false;
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });
    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { fidelidade: true },
    });
    await informarFidelidade({ pedidoId, numeroFidelidade: '12345678909' });
    await usarPontos({ pedidoId, pontos: 100 });

    await expect(aplicarCupom({ pedidoId, codigo: 'DESC5' })).rejects.toThrow(
      'Pontos e cupom não podem ser usados no mesmo pedido',
    );
    expect((await obterCarrinho(pedidoId)).cupomAplicado).toBeUndefined();
  });
});

// US 13 / US 24: a situação do cupom sai só dos atributos cadastrados pelo administrador.
describe('situacaoCupom', () => {
  const base: Cupom = { codigo: 'SITUACAO', tipoDesconto: 'percentual', valor: 10, ativo: true };
  const agora = new Date('2026-10-15T12:00:00-03:00');

  it('classifica cada cupom pela regra que o impede de ser aceito', () => {
    expect(situacaoCupom(base, agora)).toBe('valido');
    expect(situacaoCupom({ ...base, ativo: false }, agora)).toBe('inativo');
    expect(situacaoCupom({ ...base, validoDe: '2026-10-15T12:00:01-03:00' }, agora)).toBe(
      'nao_vigente',
    );
    expect(situacaoCupom({ ...base, validoAte: '2026-10-15T11:59:59-03:00' }, agora)).toBe(
      'expirado',
    );
    expect(situacaoCupom({ ...base, limiteUsos: 3, usos: 3 }, agora)).toBe('esgotado');
    expect(situacaoCupom({ ...base, limiteUsos: 3, usos: 2 }, agora)).toBe('valido');
  });

  it('respeita a hora, não só a data, da vigência', () => {
    const cupom = {
      ...base,
      validoDe: '2026-10-15T18:00:00-03:00',
      validoAte: '2026-10-15T22:00:00-03:00',
    };
    expect(situacaoCupom(cupom, new Date('2026-10-15T17:59:00-03:00'))).toBe('nao_vigente');
    expect(situacaoCupom(cupom, new Date('2026-10-15T20:00:00-03:00'))).toBe('valido');
    expect(situacaoCupom(cupom, new Date('2026-10-15T22:01:00-03:00'))).toBe('expirado');
    expect(() => validarCupom(cupom, new Date('2026-10-15T17:59:00-03:00'))).toThrow(
      /a partir de 15\/10\/2026.*18:00/,
    );
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
