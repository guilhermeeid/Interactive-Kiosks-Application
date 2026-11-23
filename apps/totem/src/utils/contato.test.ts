import { describe, expect, it } from 'vitest';
import { celularValido, emailValido, formatarCelular } from './contato';

describe('contato do comprovante', () => {
  it('aceita e-mail bem formado e recusa os malformados', () => {
    expect(emailValido('joao.silva@gmail.com')).toBe(true);
    expect(emailValido('a+b@empresa.com.br')).toBe(true);
    for (const invalido of [
      '',
      'joao',
      'joao@',
      '@gmail.com',
      'joao@gmail',
      'jo ao@x.com',
      'a..b@x.com',
      'a@b.c',
    ]) {
      expect(emailValido(invalido)).toBe(false);
    }
  });

  it('celular precisa de DDD válido e 9 dígitos começando por 9', () => {
    expect(celularValido('11987654321')).toBe(true);
    expect(celularValido('1187654321')).toBe(false); // fixo, sem o 9
    expect(celularValido('11887654321')).toBe(false);
    expect(celularValido('20987654321')).toBe(false); // DDD inexistente
    expect(celularValido('1198765432')).toBe(false);
  });

  it('formata o celular enquanto é digitado', () => {
    expect(formatarCelular('11')).toBe('11');
    expect(formatarCelular('11987')).toBe('(11) 987');
    expect(formatarCelular('11987654321')).toBe('(11) 98765-4321');
  });
});
