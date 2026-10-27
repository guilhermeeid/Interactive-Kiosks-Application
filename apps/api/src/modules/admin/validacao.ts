import { CAMINHO_IMAGEM } from '../../db/persistencia';
import { HttpError } from '../../errors';

// Validação campo a campo do que chega dos formulários da área restrita. Cada função
// devolve o valor já normalizado ou recusa com uma mensagem que nomeia o campo.

const COR_HEX = /^#[0-9a-f]{6}$/i;

export function texto(valor: unknown, campo: string, maximo: number, obrigatorio = true): string {
  const limpo = typeof valor === 'string' ? valor.trim() : '';
  if (obrigatorio && !limpo) {
    throw new HttpError(400, `Preencha o campo "${campo}"`);
  }
  if (limpo.length > maximo) {
    throw new HttpError(400, `"${campo}" aceita no máximo ${maximo} caracteres`);
  }
  return limpo;
}

export function textoOpcional(valor: unknown, campo: string, maximo: number): string | undefined {
  return texto(valor, campo, maximo, false) || undefined;
}

export function cor(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !COR_HEX.test(valor)) {
    throw new HttpError(400, `"${campo}" deve ser uma cor em hex, como #d62828`);
  }
  return valor.toLowerCase();
}

export function booleano(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') {
    throw new HttpError(400, `Valor inválido em "${campo}"`);
  }
  return valor;
}

export function numero(valor: unknown, campo: string, minimo: number, maximo: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < minimo || valor > maximo) {
    throw new HttpError(400, `"${campo}" deve ficar entre ${minimo} e ${maximo}`);
  }
  return valor;
}

export function inteiro(valor: unknown, campo: string, minimo: number, maximo: number): number {
  if (!Number.isInteger(valor)) {
    throw new HttpError(400, `"${campo}" deve ser um número inteiro`);
  }
  return numero(valor, campo, minimo, maximo);
}

// Campo opcional: null/undefined = sem valor.
export function inteiroOpcional(
  valor: unknown,
  campo: string,
  minimo: number,
  maximo: number,
): number | undefined {
  return valor === null || valor === undefined ? undefined : inteiro(valor, campo, minimo, maximo);
}

// Valor opcional em centavos (ex.: pedido mínimo): vazio = sem valor; zero ou negativo
// não fazem sentido.
export function centavosOpcional(valor: unknown, campo: string): number | undefined {
  if (valor === null || valor === undefined) {
    return undefined;
  }
  if (!Number.isInteger(valor)) {
    throw new HttpError(400, `"${campo}" deve ser um valor em reais, como 50,00`);
  }
  if ((valor as number) <= 0) {
    throw new HttpError(400, `"${campo}" precisa ser maior que zero (ou fique vazio)`);
  }
  if ((valor as number) > 10_000_000) {
    throw new HttpError(400, `"${campo}" vai até R$ 100.000,00`);
  }
  return valor as number;
}

// Só caminhos de imagem gerados pela própria API (/imagens/...), nunca endereços externos.
export function imagemOpcional(valor: unknown, campo: string): string | undefined {
  if (valor === null || valor === undefined || valor === '') {
    return undefined;
  }
  if (typeof valor !== 'string' || !CAMINHO_IMAGEM.test(valor)) {
    throw new HttpError(400, `Imagem inválida em "${campo}"`);
  }
  return valor;
}

export function dataOpcional(valor: unknown, campo: string): string | undefined {
  if (valor === null || valor === undefined || valor === '') {
    return undefined;
  }
  const data = typeof valor === 'string' ? new Date(valor) : new Date(NaN);
  if (Number.isNaN(data.getTime())) {
    throw new HttpError(400, `Data inválida em "${campo}"`);
  }
  return data.toISOString();
}

export function urlOpcional(valor: unknown, campo: string): string | undefined {
  const limpo = textoOpcional(valor, campo, 300);
  if (!limpo) {
    return undefined;
  }
  try {
    const url = new URL(limpo);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    // cai na recusa abaixo
  }
  throw new HttpError(400, `"${campo}" deve ser um endereço que comece com https://`);
}
