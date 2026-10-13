import { useCallback, useState, type ReactNode } from 'react';
import type { ConfigTotem } from '@totem/shared';
import type { AdminApi } from '../../services/adminApi';

// Peças compartilhadas pelas abas da tela de administrador.

export interface PropsAba {
  api: AdminApi;
  config: ConfigTotem;
  // Salva a configuração inteira e devolve a versão gravada (com ids e textos já
  // normalizados pelo servidor).
  salvarConfig: (config: ConfigTotem) => Promise<ConfigTotem>;
}

// Mudanças de configuração só chegam ao totem quando ele é reiniciado.
export const SALVO_AGUARDA_REINICIO =
  'Salvo. O totem passa a usar as mudanças quando for reiniciado.';

export interface Retorno {
  tipo: 'ok' | 'erro';
  texto: string;
}

// Executa uma chamada à API guardando o resultado para exibir ao administrador.
// `executar` devolve true se deu certo.
export function useAcao() {
  const [retorno, setRetorno] = useState<Retorno | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const executar = useCallback(async (acao: () => Promise<unknown>, sucesso?: string) => {
    setOcupado(true);
    try {
      await acao();
      setRetorno(sucesso ? { tipo: 'ok', texto: sucesso } : null);
      return true;
    } catch (err) {
      setRetorno({ tipo: 'erro', texto: (err as Error).message });
      return false;
    } finally {
      setOcupado(false);
    }
  }, []);

  return { retorno, ocupado, executar };
}

export function MensagemRetorno({ retorno }: { retorno: Retorno | null }) {
  if (!retorno) {
    return null;
  }
  return (
    <p className={retorno.tipo === 'erro' ? 'erro' : 'admin-ok'} role="status">
      {retorno.texto}
    </p>
  );
}

export function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <label className="admin-campo">
      <span className="admin-campo__rotulo">{rotulo}</span>
      {children}
      {dica && <small>{dica}</small>}
    </label>
  );
}

export function Opcao({
  rotulo,
  dica,
  marcado,
  aoMudar,
  travado = false,
}: {
  rotulo: string;
  dica?: string;
  marcado: boolean;
  aoMudar?: (marcado: boolean) => void;
  travado?: boolean;
}) {
  return (
    <label className="admin-opcao">
      <input
        type="checkbox"
        checked={marcado}
        disabled={travado}
        onChange={(evento) => aoMudar?.(evento.target.checked)}
      />
      <span>
        <strong>{rotulo}</strong>
        {dica && <small>{dica}</small>}
      </span>
    </label>
  );
}
