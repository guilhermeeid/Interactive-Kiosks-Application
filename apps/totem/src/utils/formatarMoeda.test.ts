import { describe, expect, it } from 'vitest';
import { centavosParaReais, formatarCentavos, reaisParaCentavos } from './formatarMoeda';

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

describe('formatarCentavos', () => {
  it('converte centavos para reais formatados como moeda pt-BR', () => {
    expect(formatarCentavos(1890)).toBe(moeda(18.9));
  });

  it('formata zero', () => {
    expect(formatarCentavos(0)).toBe(moeda(0));
  });

  it('formata valores com milhar', () => {
    expect(formatarCentavos(123456)).toBe(moeda(1234.56));
  });
});

describe('reaisParaCentavos', () => {
  it('lê valores digitados em reais, com vírgula, milhar ou símbolo', () => {
    expect(reaisParaCentavos('18,90')).toBe(1890);
    expect(reaisParaCentavos('7')).toBe(700);
    expect(reaisParaCentavos('0,5')).toBe(50);
    expect(reaisParaCentavos('R$ 1.234,56')).toBe(123456);
  });

  it('devolve null para texto que não é um valor em dinheiro', () => {
    expect(reaisParaCentavos('')).toBeNull();
    expect(reaisParaCentavos('abc')).toBeNull();
    expect(reaisParaCentavos('-5')).toBeNull();
    expect(reaisParaCentavos('1,999')).toBeNull();
  });
});

describe('centavosParaReais', () => {
  it('formata centavos para preencher um campo de preço', () => {
    expect(centavosParaReais(1890)).toBe('18,90');
    expect(centavosParaReais(50)).toBe('0,50');
  });
});
