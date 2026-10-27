import type { TipoDescontoCupom } from '@totem/shared';
import { reaisParaCentavos } from './formatarMoeda';

// US 36: valores do formulário de cupom, como o administrador os digita. Um cupom
// precisa dar algum desconto: zero ou negativo não faz sentido. A API confere de novo.

function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Desconto do cupom: percentual (ex.: "10" ou "12,5") ou em reais (ex.: "5,00"), que
// volta em centavos.
export function lerDescontoDoCupom(tipo: TipoDescontoCupom, digitado: string): number {
  const texto = digitado.trim();
  const exemplo =
    tipo === 'percentual'
      ? 'Informe o percentual de desconto, como 10'
      : 'Informe o desconto em reais, como 5,00';
  if (!texto) {
    throw new Error(exemplo);
  }
  if (texto.startsWith('-')) {
    throw new Error('O desconto precisa ser maior que zero');
  }
  const valor = tipo === 'percentual' ? Number(texto.replace(',', '.')) : reaisParaCentavos(texto);
  if (valor === null || !Number.isFinite(valor)) {
    throw new Error(exemplo);
  }
  if (valor <= 0) {
    throw new Error('O desconto precisa ser maior que zero');
  }
  if (tipo === 'percentual' && valor > 100) {
    throw new Error('O desconto em percentual vai até 100%');
  }
  return valor;
}

// Valor opcional em reais (pedido mínimo, desconto máximo): vazio = sem valor.
export function lerReaisOpcional(digitado: string, campo: string): number | null {
  const texto = digitado.trim();
  if (!texto) {
    return null;
  }
  const centavos = texto.startsWith('-') ? -1 : reaisParaCentavos(texto);
  if (centavos === null) {
    throw new Error(`Informe ${campo} em reais, como 50,00 (ou deixe vazio)`);
  }
  if (centavos <= 0) {
    throw new Error(`${comMaiuscula(campo)} precisa ser maior que zero (ou deixe vazio)`);
  }
  return centavos;
}

// Quantidade de usos: vazio = sem limite; zero não faz sentido.
export function lerLimiteDeUsos(digitado: string): number | null {
  const texto = digitado.trim();
  if (!texto) {
    return null;
  }
  if (!/^\d+$/.test(texto)) {
    throw new Error('A quantidade de usos deve ser um número inteiro (ou vazia, para não limitar)');
  }
  if (Number(texto) === 0) {
    throw new Error('A quantidade de usos precisa ser pelo menos 1 (ou vazia, para não limitar)');
  }
  return Number(texto);
}
