import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ConfigTotem, TermoConsentimento } from '@totem/shared';
import { BotaoTouch } from '../components/BotaoTouch';
import { buscarConfig, buscarTermoConsentimento } from '../services/apiClient';
import { aplicarTema } from '../utils/tema';

// O que o totem lê uma única vez, ao iniciar: a configuração definida pelo administrador
// (aparência, categorias, fidelidade, formas de pagamento, cupons) e o termo de
// consentimento vigente (US 29). Mudanças feitas em /admin só passam a valer depois que
// o totem é reiniciado.
interface Inicializacao {
  config: ConfigTotem;
  termo: TermoConsentimento;
}

const ConfigContext = createContext<Inicializacao | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [inicializacao, setInicializacao] = useState<Inicializacao | null>(null);
  const [falhou, setFalhou] = useState(false);

  const carregar = useCallback(() => {
    setFalhou(false);
    Promise.all([buscarConfig(), buscarTermoConsentimento()])
      .then(([config, termo]) => {
        aplicarTema(config.aparencia);
        setInicializacao({ config, termo });
      })
      .catch(() => setFalhou(true));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (falhou) {
    return (
      <div className="tela">
        <div className="vazio cartao">
          <p className="aviso">Não foi possível iniciar o totem. Chame um atendente.</p>
          <BotaoTouch variante="primario" onClick={carregar}>
            Tentar de novo
          </BotaoTouch>
        </div>
      </div>
    );
  }
  if (!inicializacao) {
    return (
      <div className="tela">
        <p className="aviso">Carregando...</p>
      </div>
    );
  }

  return <ConfigContext.Provider value={inicializacao}>{children}</ConfigContext.Provider>;
}

function useInicializacao(): Inicializacao {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig deve ser usado dentro de um ConfigProvider');
  }
  return context;
}

export function useConfig(): ConfigTotem {
  return useInicializacao().config;
}

export function useTermoConsentimento(): TermoConsentimento {
  return useInicializacao().termo;
}
