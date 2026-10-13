import { describe, expect, it } from 'vitest';
import { contraste, corDeContraste, legivelSobreBranco, misturar } from './tema';

describe('corDeContraste', () => {
  it('escolhe texto branco sobre cores escuras e texto escuro sobre cores claras', () => {
    expect(corDeContraste('#d62828')).toBe('#ffffff'); // barra vermelha padrão
    expect(corDeContraste('#102a43')).toBe('#ffffff');
    expect(corDeContraste('#fff6e9')).toBe('#3b2418'); // fundo creme padrão
    expect(corDeContraste('#f7b32b')).toBe('#3b2418');
  });
});

describe('contraste', () => {
  it('vai de 1 (cores iguais) a 21 (preto sobre branco)', () => {
    expect(contraste('#ffffff', '#ffffff')).toBeCloseTo(1);
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21);
  });
});

describe('misturar', () => {
  it('interpola entre as duas cores conforme o peso', () => {
    expect(misturar('#000000', '#ffffff', 0)).toBe('#000000');
    expect(misturar('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(misturar('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('legivelSobreBranco', () => {
  it('mantém a cor que já se lê sobre branco e escurece a que não se lê', () => {
    expect(legivelSobreBranco('#d62828')).toBe('#d62828');
    const amarelo = legivelSobreBranco('#ffee58');
    expect(amarelo).not.toBe('#ffee58');
    expect(contraste(amarelo, '#ffffff')).toBeGreaterThanOrEqual(3);
  });
});
