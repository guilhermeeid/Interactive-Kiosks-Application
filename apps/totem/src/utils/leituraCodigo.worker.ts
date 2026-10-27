import { lerCodigoNoQuadro, type LeituraCodigo } from './leituraCodigo';

// Web Worker da câmera: analisa cada quadro fora da tela principal. Num quadro com muito
// ruído o QR pode levar quase um segundo, e a tela do totem não pode travar por isso.

export interface QuadroParaLer {
  rgba: Uint8ClampedArray;
  largura: number;
  altura: number;
}

export interface ResultadoDaLeitura {
  leitura: LeituraCodigo | null;
}

// Só o que este arquivo usa do escopo do worker (os tipos do projeto são os da página).
const escopo = self as unknown as {
  onmessage: ((evento: MessageEvent<QuadroParaLer>) => void) | null;
  postMessage: (mensagem: ResultadoDaLeitura) => void;
};

escopo.onmessage = ({ data }) => {
  escopo.postMessage({ leitura: lerCodigoNoQuadro(data.rgba, data.largura, data.altura) });
};
