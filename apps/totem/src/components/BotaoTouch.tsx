import type { ButtonHTMLAttributes } from 'react';

// Botão de alvo de toque grande, reutilizado em todas as telas do totem.
// A aparência de cada variante fica em styles/global.css (.botao--<variante>).
export type VarianteBotao = 'padrao' | 'primario' | 'destaque' | 'perigo';

export interface BotaoTouchProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao;
}

export function BotaoTouch({ variante = 'padrao', className, ...props }: BotaoTouchProps) {
  const classes = ['botao', `botao--${variante}`, className].filter(Boolean).join(' ');
  return <button type="button" className={classes} {...props} />;
}
