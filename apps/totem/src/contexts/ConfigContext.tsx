import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ConfigTotem, TermoConsentimento } from '@totem/shared';
import { BotaoTouch } from '../components/BotaoTouch';
import { buscarConfig, buscarTermoConsentimento } from '../services/apiClient';
import { INTERVALO_ATUALIZACAO_CARDAPIO_MS } from '../utils/atualizacaoCardapio';
import { aplicarTema } from '../utils/tema';

// O que o totem lê ao iniciar: a configuração definida pelo administrador (aparência,
// categorias, fidelidade, formas de pagamento, cupons) e o termo de consentimento
// vigente (US 29). Mudanças feitas em /admin só passam a valer depois que o totem é
// reiniciado — menos a ordem e a ativação das categorias, que valem na hora: elas são
// relidas a cada 30 segundos, junto com o cardápio.
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

  // Ordem e ativação das categorias (arrastar e soltar / desativar no /admin).
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      buscarConfig()
        .then(({ categorias }) =>
          setInicializacao((atual) =>
            atual && JSON.stringify(atual.config.categorias) !== JSON.stringify(categorias)
              ? { ...atual, config: { ...atual.config, categorias } }
              : atual,
          ),
        )
        .catch(() => undefined); // fora do ar: tenta de novo no próximo ciclo
    }, INTERVALO_ATUALIZACAO_CARDAPIO_MS);
    return () => window.clearInterval(intervalo);
  }, []);

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
