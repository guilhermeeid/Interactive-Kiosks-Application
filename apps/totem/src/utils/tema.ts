import type { AparenciaTotem } from '@totem/shared';

// Tema do totem: o administrador escolhe só a cor do fundo, da barra do topo e do nome
// da loja. As demais cores (textos, detalhes, sombras) são calculadas aqui por
// contraste, para a tela continuar legível com qualquer combinação.

const BRANCO = '#ffffff';
const CAFE = '#3b2418'; // texto escuro padrão da identidade visual

function canais(hex: string): [number, number, number] {
  const valor = parseInt(hex.slice(1), 16);
  return [(valor >> 16) & 255, (valor >> 8) & 255, valor & 255];
}

// Luminância relativa (WCAG): 0 para preto, 1 para branco.
export function luminancia(hex: string): number {
  const [r, g, b] = canais(hex).map((canal) => {
    const c = canal / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Razão de contraste (WCAG) entre duas cores: de 1 (iguais) a 21 (preto sobre branco).
export function contraste(a: string, b: string): number {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (clara + 0.05) / (escura + 0.05);
}

// Cor de texto que melhor se lê sobre `fundo`: branco ou o café da identidade.
export function corDeContraste(fundo: string): string {
  return contraste(fundo, BRANCO) >= contraste(fundo, CAFE) ? BRANCO : CAFE;
}

// Mistura `a` com `b`; `peso` é quanto de `b` entra (0 = só a, 1 = só b).
export function misturar(a: string, b: string, peso: number): string {
  const [ca, cb] = [canais(a), canais(b)];
  return `#${ca
    .map((canal, i) => Math.round(canal + (cb[i] - canal) * peso))
    .map((canal) => canal.toString(16).padStart(2, '0'))
    .join('')}`;
}

// Versão de `cor` que se lê sobre os cartões brancos (ex.: preço dos itens): se a cor
// escolhida for clara demais, escurece até ter contraste suficiente.
export function legivelSobreBranco(cor: string): string {
  let resultado = cor;
  for (let passo = 0; passo < 10 && contraste(resultado, BRANCO) < 3; passo++) {
    resultado = misturar(resultado, '#000000', 0.15);
  }
  return resultado;
}

// Variáveis CSS (ver global.css) que realizam a aparência escolhida pelo administrador.
export function variaveisDoTema(
  aparencia: Pick<AparenciaTotem, 'corFundo' | 'corBarra' | 'corNome'>,
): Record<string, string> {
  const { corFundo, corBarra, corNome } = aparencia;
  const textoFundo = corDeContraste(corFundo);
  return {
    '--cor-fundo': corFundo,
    '--cor-fundo-texto': textoFundo,
    '--cor-fundo-texto-suave': misturar(textoFundo, corFundo, 0.35),
    '--cor-pontilhado': misturar(corFundo, textoFundo, 0.08),
    '--cor-ketchup': corBarra,
    '--cor-ketchup-escuro': misturar(corBarra, '#000000', 0.22),
    '--cor-ketchup-texto': corDeContraste(corBarra),
    '--cor-preco': legivelSobreBranco(corBarra),
    '--cor-nome-loja': corNome,
  };
}

// Aplica o tema na página inteira (totem). A tela de administrador usa
// `variaveisDoTema` só na prévia, para uma cor ruim nunca deixá-la ilegível.
export function aplicarTema(aparencia: AparenciaTotem): void {
  const raiz = document.documentElement;
  for (const [nome, valor] of Object.entries(variaveisDoTema(aparencia))) {
    raiz.style.setProperty(nome, valor);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', aparencia.corBarra);
}
