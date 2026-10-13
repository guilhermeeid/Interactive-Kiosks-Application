import { describe, expect, it } from 'vitest';
import { cpfValido, limparCpf } from './cpf';

describe('cpfValido', () => {
  it('aceita CPFs com os dois dígitos verificadores corretos, com ou sem máscara', () => {
    expect(cpfValido('12345678909')).toBe(true);
    expect(cpfValido('123.456.789-09')).toBe(true);
    expect(cpfValido('111.444.777-35')).toBe(true);
  });

  it('recusa CPF com dígito verificador errado', () => {
    expect(cpfValido('12345678900')).toBe(false); // segundo dígito errado
    expect(cpfValido('12345678919')).toBe(false); // primeiro dígito errado
  });

  it('recusa sequências repetidas, que passariam na conta dos dígitos', () => {
    expect(cpfValido('00000000000')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
  });

  it('recusa tamanho errado e texto vazio', () => {
    expect(cpfValido('')).toBe(false);
    expect(cpfValido('1234567890')).toBe(false);
    expect(cpfValido('123456789099')).toBe(false);
  });
});

describe('limparCpf', () => {
  it('mantém só os dígitos', () => {
    expect(limparCpf('123.456.789-09')).toBe('12345678909');
  });
});
