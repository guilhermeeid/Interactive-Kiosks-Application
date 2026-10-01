import { useEffect, type RefObject } from 'react';

// Chama `aoFechar` quando o cliente toca fora do elemento de `ref` enquanto `aberto`.
// Usado para esconder o teclado virtual sem perder o texto já digitado.
export function useFecharAoTocarFora(
  ref: RefObject<HTMLElement>,
  aberto: boolean,
  aoFechar: () => void,
): void {
  useEffect(() => {
    if (!aberto) return;
    function aoTocar(evento: PointerEvent) {
      if (!ref.current?.contains(evento.target as Node)) {
        aoFechar();
      }
    }
    document.addEventListener('pointerdown', aoTocar);
    return () => document.removeEventListener('pointerdown', aoTocar);
  }, [ref, aberto, aoFechar]);
}
