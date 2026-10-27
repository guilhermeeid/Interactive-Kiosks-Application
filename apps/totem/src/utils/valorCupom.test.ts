import { describe, expect, it } from 'vitest';
import { lerDescontoDoCupom, lerLimiteDeUsos, lerReaisOpcional } from './valorCupom';

// US 36: o formulário não deixa criar cupom zerado ou negativo.
describe('lerDescontoDoCupom', () => {
  it('aceita percentual e valor em reais maiores que zero', () => {
    expect(lerDescontoDoCupom('percentual', '10')).toBe(10);
    expect(lerDescontoDoCupom('percentual', '12,5')).toBe(12.5);
    expect(lerDescontoDoCupom('percentual', '100')).toBe(100);
    expect(lerDescontoDoCupom('valor_fixo', '5,00')).toBe(500);
    expect(lerDescontoDoCupom('valor_fixo', '0,01')).toBe(1);
  });

  it('recusa desconto zero', () => {
    expect(() => lerDescontoDoCupom('percentual', '0')).toThrow('maior que zero');
    expect(() => lerDescontoDoCupom('percentual', '0,00')).toThrow('maior que zero');
    expect(() => lerDescontoDoCupom('valor_fixo', '0')).toThrow('maior que zero');
    expect(() => lerDescontoDoCupom('valor_fixo', 'R$ 0,00')).toThrow('maior que zero');
  });

  it('recusa desconto negativo', () => {
    expect(() => lerDescontoDoCupom('percentual', '-10')).toThrow('maior que zero');
    expect(() => lerDescontoDoCupom('valor_fixo', '-5,00')).toThrow('maior que zero');
    expect(() => lerDescontoDoCupom('valor_fixo', ' -1')).toThrow('maior que zero');
  });

  it('recusa campo vazio, texto e percentual acima de 100', () => {
    expect(() => lerDescontoDoCupom('percentual', '')).toThrow('como 10');
    expect(() => lerDescontoDoCupom('valor_fixo', 'cinco')).toThrow('como 5,00');
    expect(() => lerDescontoDoCupom('percentual', '150')).toThrow('até 100%');
  });
});

describe('lerReaisOpcional e lerLimiteDeUsos', () => {
  it('vazio quer dizer sem valor', () => {
    expect(lerReaisOpcional('  ', 'o pedido mínimo')).toBeNull();
    expect(lerLimiteDeUsos('')).toBeNull();
  });

  it('recusa zero e negativo no pedido mínimo, no teto e nos usos', () => {
    expect(() => lerReaisOpcional('0', 'o pedido mínimo')).toThrow(
      'O pedido mínimo precisa ser maior que zero',
    );
    expect(() => lerReaisOpcional('-50', 'o desconto máximo')).toThrow(
      'O desconto máximo precisa ser maior que zero',
    );
    expect(() => lerLimiteDeUsos('0')).toThrow('pelo menos 1');
    expect(() => lerLimiteDeUsos('-3')).toThrow('número inteiro');
  });

  it('aceita valores válidos', () => {
    expect(lerReaisOpcional('50,00', 'o desconto máximo')).toBe(5000);
    expect(lerLimiteDeUsos('100')).toBe(100);
  });
});
