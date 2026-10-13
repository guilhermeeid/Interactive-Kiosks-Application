import { useCallback, useEffect, useRef, useState } from 'react';

// Aviso curto que aparece e some sozinho (ex.: "quantidade máxima atingida"). Devolve o
// texto em exibição (ou null) e a função que mostra um novo aviso.
export function useAvisoTemporario(duracaoMs = 3500): [string | null, (texto: string) => void] {
  const [aviso, setAviso] = useState<string | null>(null);
  const temporizador = useRef<number>();

  const mostrar = useCallback(
    (texto: string) => {
      setAviso(texto);
      window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(() => setAviso(null), duracaoMs);
    },
    [duracaoMs],
  );

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  return [aviso, mostrar];
}
