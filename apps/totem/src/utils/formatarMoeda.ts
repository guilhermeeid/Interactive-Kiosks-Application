export function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Lê um valor digitado em reais ("18,90", "R$ 1.234,5", "7") e devolve em centavos;
// `null` se o texto não for um valor em dinheiro.
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[R$\s.]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) {
    return null;
  }
  return Math.round(Number(limpo) * 100);
}

// Inverso de reaisParaCentavos, para preencher campos de formulário: 1890 -> "18,90".
export function centavosParaReais(centavos: number): string {
  return (centavos / 100).toFixed(2).replace('.', ',');
}
