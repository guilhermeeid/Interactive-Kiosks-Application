import type { FormaPagamento } from '@totem/shared';

// Formas de pagamento na ordem em que aparecem no totem e na área restrita.
// Item 9: vale-refeição e vale-alimentação são formas próprias (não crédito nem débito),
// com código próprio na NFC-e e habilitação separada na credenciadora.
export const FORMAS_PAGAMENTO: { valor: FormaPagamento; rotulo: string; icone: string }[] = [
  { valor: 'credito', rotulo: 'Crédito', icone: '💳' },
  { valor: 'debito', rotulo: 'Débito', icone: '🏧' },
  { valor: 'pix', rotulo: 'Pix', icone: '⚡' },
  { valor: 'vale_refeicao', rotulo: 'Vale-refeição', icone: '🍽️' },
  { valor: 'vale_alimentacao', rotulo: 'Vale-alimentação', icone: '🛒' },
  { valor: 'dinheiro', rotulo: 'Dinheiro (no caixa)', icone: '💵' },
];

export function nomeFormaPagamento(forma: FormaPagamento): string {
  return FORMAS_PAGAMENTO.find((opcao) => opcao.valor === forma)?.rotulo ?? forma;
}
