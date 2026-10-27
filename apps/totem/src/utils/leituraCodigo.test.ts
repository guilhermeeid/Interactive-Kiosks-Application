import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { Code128Reader, EAN13Reader } from '@zxing/library';
import { lerCodigoNoQuadro } from './leituraCodigo';

// Quadros sintéticos, como a câmera os entregaria (RGBA), com o código no meio.

// Tabelas de padrões do próprio ZXing (privadas nos tipos, públicas no código).
const PADROES_CODE128 = (Code128Reader as unknown as { CODE_PATTERNS: Int32Array[] }).CODE_PATTERNS;
const PARIDADES_EAN13 = (EAN13Reader as unknown as { FIRST_DIGIT_ENCODINGS: number[] })
  .FIRST_DIGIT_ENCODINGS;
const PADROES_L_EAN13 = (EAN13Reader as unknown as { L_PATTERNS: Int32Array[] }).L_PATTERNS;

const LARGURA = 640;
const ALTURA = 480;

function quadroBranco(): Uint8ClampedArray {
  return new Uint8ClampedArray(LARGURA * ALTURA * 4).fill(255);
}

function pintar(rgba: Uint8ClampedArray, x: number, y: number, escuro: boolean) {
  const p = (y * LARGURA + x) * 4;
  const tom = escuro ? 20 : 245;
  rgba[p] = rgba[p + 1] = rgba[p + 2] = tom;
}

// Barras: larguras alternadas (barra, espaço, barra...) viram módulos escuros/claros.
function modulosDasLarguras(larguras: number[], comecaComBarra = true): boolean[] {
  const modulos: boolean[] = [];
  larguras.forEach((largura, i) => {
    const escuro = comecaComBarra ? i % 2 === 0 : i % 2 === 1;
    for (let k = 0; k < largura; k++) modulos.push(escuro);
  });
  return modulos;
}

function desenharBarras(modulos: boolean[], larguraModulo: number): Uint8ClampedArray {
  const rgba = quadroBranco();
  const total = modulos.length * larguraModulo;
  const x0 = Math.floor((LARGURA - total) / 2);
  for (let y = 160; y < 320; y++) {
    for (let x = 0; x < total; x++) {
      pintar(rgba, x0 + x, y, modulos[Math.floor(x / larguraModulo)]);
    }
  }
  return rgba;
}

// Code 128, conjunto B (letras e números), com a tabela de padrões do próprio ZXing.
function code128(texto: string): boolean[] {
  const valores = [104, ...[...texto].map((letra) => letra.charCodeAt(0) - 32)];
  const verificador = valores.reduce((soma, valor, i) => soma + valor * Math.max(i, 1), 0) % 103;
  const simbolos = [...valores, verificador, 106];
  const silencio = Array<boolean>(10).fill(false);
  return [
    ...silencio,
    ...simbolos.flatMap((s) => modulosDasLarguras(Array.from(PADROES_CODE128[s]))),
    ...silencio,
  ];
}

// EAN-13 (código de produto), também com as tabelas do ZXing.
function ean13(digitos: string): boolean[] {
  const d = [...digitos].map(Number);
  const paridade = PARIDADES_EAN13[d[0]];
  // Padrão L do dígito; o G é o mesmo de trás para a frente.
  const padrao = (digito: number) =>
    digito < 10
      ? Array.from(PADROES_L_EAN13[digito])
      : Array.from(PADROES_L_EAN13[digito - 10]).reverse();
  const silencio = Array<boolean>(9).fill(false);
  return [
    ...silencio,
    ...modulosDasLarguras([1, 1, 1]),
    ...d
      .slice(1, 7)
      .flatMap((digito, x) =>
        modulosDasLarguras(padrao((paridade >> (5 - x)) & 1 ? digito + 10 : digito), false),
      ),
    ...modulosDasLarguras([1, 1, 1, 1, 1], false),
    ...d.slice(7).flatMap((digito) => modulosDasLarguras(padrao(digito))),
    ...modulosDasLarguras([1, 1, 1]),
    ...silencio,
  ];
}

function quadroComQr(texto: string): Uint8ClampedArray {
  const { modules } = QRCode.create(texto, { errorCorrectionLevel: 'M' });
  const escala = 8;
  const lado = (modules.size + 8) * escala;
  const x0 = Math.floor((LARGURA - lado) / 2);
  const y0 = Math.floor((ALTURA - lado) / 2);
  const rgba = quadroBranco();
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const mx = Math.floor(x / escala) - 4;
      const my = Math.floor(y / escala) - 4;
      const dentro = mx >= 0 && my >= 0 && mx < modules.size && my < modules.size;
      pintar(rgba, x0 + x, y0 + y, dentro && !!modules.get(my, mx));
    }
  }
  return rgba;
}

describe('lerCodigoNoQuadro', () => {
  it('lê o QR Code de um cupom', () => {
    expect(lerCodigoNoQuadro(quadroComQr('TOTEM-CUPOM:BEMVINDO10'), LARGURA, ALTURA)).toEqual({
      formato: 'qr',
      conteudo: 'TOTEM-CUPOM:BEMVINDO10',
    });
  });

  it('lê o código de barras (Code 128) de um cupom', () => {
    expect(lerCodigoNoQuadro(desenharBarras(code128('DESC5'), 3), LARGURA, ALTURA)).toEqual({
      formato: 'barras',
      conteudo: 'DESC5',
    });
  });

  it('lê código de barras com módulos finos, como de longe na câmera', () => {
    expect(lerCodigoNoQuadro(desenharBarras(code128('BEMVINDO10'), 2), LARGURA, ALTURA)).toEqual({
      formato: 'barras',
      conteudo: 'BEMVINDO10',
    });
  });

  it('lê também código de barras de produto (EAN-13), que o totem recusa como cupom', () => {
    expect(lerCodigoNoQuadro(desenharBarras(ean13('7891234567895'), 3), LARGURA, ALTURA)).toEqual({
      formato: 'barras',
      conteudo: '7891234567895',
    });
  });

  it('devolve null quando não há código no quadro', () => {
    expect(lerCodigoNoQuadro(quadroBranco(), LARGURA, ALTURA)).toBeNull();
  });
});
