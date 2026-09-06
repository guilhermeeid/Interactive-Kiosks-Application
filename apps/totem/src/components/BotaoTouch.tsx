import type { ButtonHTMLAttributes } from 'react';

// Botão de alvo de toque grande, reutilizado em todas as telas do totem.
// TODO: aplicar estilo visual definitivo (tamanho mínimo de toque, feedback ao
// pressionar) quando o design system do totem for definido.
export function BotaoTouch(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} />;
}
