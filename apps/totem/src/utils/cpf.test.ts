import { describe, expect, it } from 'vitest';
import { formatarCpf, mascararCpf } from './cpf';

describe('formatarCpf', () => {
  it('aplica a máscara conforme os dígitos vão sendo digitados', () => {
    expect(formatarCpf('')).toBe('');
    expect(formatarCpf('123')).toBe('123');
    expect(formatarCpf('1234')).toBe('123.4');
    expect(formatarCpf('1234567')).toBe('123.456.7');
    expect(formatarCpf('1234567890')).toBe('123.456.789-0');
    expect(formatarCpf('12345678909')).toBe('123.456.789-09');
  });

  it('ignora o que não é dígito e o que passa de 11 dígitos', () => {
    expect(formatarCpf('123.456.789-09')).toBe('123.456.789-09');
    expect(formatarCpf('123456789099')).toBe('123.456.789-09');
  });
});

describe('mascararCpf', () => {
  it('mostra só os seis dígitos do meio', () => {
    expect(mascararCpf('12345678909')).toBe('***.456.789-**');
  });
});
