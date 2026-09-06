import { useEffect } from 'react';

// Hook que prepara a tela para o modo kiosk: fullscreen e sem menu de contexto,
// já que o totem não tem mouse/teclado físico disponível para o cliente.
// TODO: implementar solicitação de fullscreen (Fullscreen API) e o bloqueio do menu
// de contexto (contextmenu) de forma robusta entre navegadores/dispositivos usados
// nos totens.
export function useKioskMode(): void {
  useEffect(() => {
    // TODO: document.documentElement.requestFullscreen() + listener de 'contextmenu'.
  }, []);
}
