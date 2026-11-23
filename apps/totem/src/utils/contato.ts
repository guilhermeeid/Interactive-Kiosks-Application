// Validação do contato do comprovante. A mesma regra roda no totem (antes do envio, para
// o cliente corrigir na hora) e aqui (o servidor nunca confia na tela).
// Espelho de apps/api/src/modules/comprovante/contato.ts — mudou um, mude o outro.

// DDDs em uso no Brasil (Anatel).
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

// usuario@dominio.tld, sem espaços nem pontos repetidos, até 254 caracteres.
export function emailValido(email: string): boolean {
  return (
    email.length <= 254 &&
    !email.includes('..') &&
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(email)
  );
}

// Celular para SMS: DDD válido + 9 dígitos começando por 9 (só números, 11 ao todo).
export function celularValido(numeros: string): boolean {
  return /^\d{11}$/.test(numeros) && DDDS.has(Number(numeros.slice(0, 2))) && numeros[2] === '9';
}

// (11) 98765-4321, à medida que os números são digitados.
export function formatarCelular(numeros: string): string {
  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
}
