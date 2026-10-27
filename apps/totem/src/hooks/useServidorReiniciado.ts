import { useEffect, useRef, useState } from 'react';
import { buscarVersaoServidor } from '../services/apiClient';
import { INTERVALO_ATUALIZACAO_CARDAPIO_MS } from '../utils/atualizacaoCardapio';

// Item 7: as mudanças do Administrador entram em vigor quando o servidor reinicia. Este
// hook confere de tempos em tempos se o servidor foi reiniciado desde que o totem abriu;
// quando sim, o totem se recarrega assim que voltar à tela inicial (sem interromper um
// cliente no meio do pedido).
export function useServidorReiniciado(): boolean {
  const versaoInicial = useRef<string | null>(null);
  const [reiniciado, setReiniciado] = useState(false);

  useEffect(() => {
    let ativo = true;
    const conferir = () =>
      buscarVersaoServidor()
        .then(({ versao }) => {
          if (!ativo) return;
          if (versaoInicial.current === null) {
            versaoInicial.current = versao;
          } else if (versao !== versaoInicial.current) {
            setReiniciado(true);
          }
        })
        .catch(() => undefined); // servidor fora do ar: tenta de novo no próximo ciclo
    conferir();
    const intervalo = window.setInterval(conferir, INTERVALO_ATUALIZACAO_CARDAPIO_MS);
    return () => {
      ativo = false;
      window.clearInterval(intervalo);
    };
  }, []);

  return reiniciado;
}
