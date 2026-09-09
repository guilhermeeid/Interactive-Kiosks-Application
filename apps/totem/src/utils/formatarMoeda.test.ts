import { describe, expect, it } from 'vitest';
import { formatarCentavos } from './formatarMoeda';

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
