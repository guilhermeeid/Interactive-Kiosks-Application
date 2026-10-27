import jsQR from 'jsqr';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatOneDReader,
  RGBLuminanceSource,
} from '@zxing/library';

// US 18: lê, num quadro da câmera, o código de barras ou o QR Code de um cupom impresso
// (ou do cartão de fidelidade). O código de barras fica com o leitor de uma dimensão do
// ZXing; o QR, com o jsQR, que tolera bem a imagem de uma webcam. Roda num Web Worker
// (ver leituraCodigo.worker.ts), para a tela não travar enquanto analisa.

export interface LeituraCodigo {
  formato: 'qr' | 'barras';
  conteudo: string;
}

// Code 128 e Code 39 levam letras e números (o código do cupom, como DESC5); EAN e UPC
// são numéricos, comuns em cupons impressos por outros sistemas.
const FORMATOS_BARRAS = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
];

// Sem TRY_HARDER: varre só as linhas do meio da imagem (onde fica a moldura), rápido o
// bastante para tentar várias versões do mesmo quadro.
const DICAS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, FORMATOS_BARRAS],
]);
const leitorBarras = new MultiFormatOneDReader(DICAS);

// As barras são verticais: a média de algumas linhas tira o ruído da câmera sem borrar
// as barras.
const LINHAS_POR_MEDIA = 4;

// Webcam sem foco de perto borra as barras finas. Realçar cada pixel em relação à média
// dos vizinhos na mesma linha devolve o contraste delas; como o realce também pode
// atrapalhar uma imagem nítida, o quadro é tentado sem e com realce.
const REALCES = [null, { raio: 2, forca: 1 }, { raio: 3, forca: 1.5 }];

function luminanciaPorMedia(rgba: Uint8ClampedArray, largura: number, altura: number) {
  const linhas = Math.floor(altura / LINHAS_POR_MEDIA);
  const luminancia = new Uint8ClampedArray(largura * linhas);
  for (let j = 0; j < linhas; j++) {
    for (let i = 0; i < largura; i++) {
      let soma = 0;
      for (let k = 0; k < LINHAS_POR_MEDIA; k++) {
        const p = ((j * LINHAS_POR_MEDIA + k) * largura + i) * 4;
        soma += rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29;
      }
      luminancia[j * largura + i] = soma / (LINHAS_POR_MEDIA * 256);
    }
  }
  return { luminancia, linhas };
}

function realcar(
  luminancia: Uint8ClampedArray,
  largura: number,
  linhas: number,
  raio: number,
  forca: number,
): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(luminancia.length);
  const janela = 2 * raio + 1;
  for (let j = 0; j < linhas; j++) {
    const base = j * largura;
    const em = (i: number) => luminancia[base + Math.min(largura - 1, Math.max(0, i))];
    let soma = 0;
    for (let i = -raio; i <= raio; i++) soma += em(i);
    for (let i = 0; i < largura; i++) {
      const valor = luminancia[base + i];
      saida[base + i] = valor + forca * (valor - soma / janela);
      soma += em(i + raio + 1) - em(i - raio);
    }
  }
  return saida;
}

function decodificarBarras(luminancia: Uint8ClampedArray, largura: number, linhas: number) {
  const imagem = new BinaryBitmap(
    new HybridBinarizer(new RGBLuminanceSource(luminancia, largura, linhas)),
  );
  try {
    return leitorBarras.decode(imagem, DICAS).getText();
  } catch {
    return null; // nenhum código de barras nesta versão do quadro
  } finally {
    leitorBarras.reset();
  }
}

function lerCodigoDeBarras(rgba: Uint8ClampedArray, largura: number, altura: number) {
  const { luminancia, linhas } = luminanciaPorMedia(rgba, largura, altura);
  for (const realce of REALCES) {
    const versao = realce
      ? realcar(luminancia, largura, linhas, realce.raio, realce.forca)
      : luminancia;
    const texto = decodificarBarras(versao, largura, linhas);
    if (texto) return texto;
  }
  return null;
}

// `rgba`: pixels do quadro, como em ImageData.data, de preferência na resolução cheia da
// câmera (as barras finas somem quando a imagem é reduzida). O código de barras vem
// primeiro por ser a tentativa mais rápida.
export function lerCodigoNoQuadro(
  rgba: Uint8ClampedArray,
  largura: number,
  altura: number,
): LeituraCodigo | null {
  const barras = lerCodigoDeBarras(rgba, largura, altura);
  if (barras) {
    return { formato: 'barras', conteudo: barras };
  }
  const qr = jsQR(rgba, largura, altura, { inversionAttempts: 'dontInvert' });
  return qr?.data ? { formato: 'qr', conteudo: qr.data } : null;
}
