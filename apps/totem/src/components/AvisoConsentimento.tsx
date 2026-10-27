import { useState } from 'react';
import type { FinalidadeConsentimento, TermoConsentimento } from '@totem/shared';
import { useConfig } from '../contexts/ConfigContext';
import { urlTermosPadrao } from '../services/apiClient';
import { TermosModal } from './TermosModal';

// US 29: aviso de finalidades exibido antes de qualquer dado pessoal ser digitado, com
// uma caixa de seleção por finalidade. Nada vem marcado: concordar é sempre um gesto do
// cliente, e deixar desmarcado é a recusa. "Termos e Condições" abre o texto completo,
// com QR Code para ler no celular (item 4).
export interface AvisoConsentimentoProps {
  termo: TermoConsentimento;
  // Finalidades oferecidas nesta tela, na ordem em que aparecem.
  finalidades: FinalidadeConsentimento[];
  aceites: Partial<Record<FinalidadeConsentimento, boolean>>;
  aoMudar: (finalidade: FinalidadeConsentimento, aceito: boolean) => void;
}

export function AvisoConsentimento({
  termo,
  finalidades,
  aceites,
  aoMudar,
}: AvisoConsentimentoProps) {
  const { urlTermos } = useConfig();
  const [termosAbertos, setTermosAbertos] = useState(false);

  return (
    <div className="consentimento">
      <p className="consentimento__aviso">{termo.aviso}</p>
      {finalidades.map((finalidade) => (
        <label key={finalidade} className="consentimento__opcao">
          <input
            type="checkbox"
            checked={aceites[finalidade] === true}
            onChange={(evento) => aoMudar(finalidade, evento.target.checked)}
          />
          <span>{termo.finalidades[finalidade]}</span>
        </label>
      ))}
      <small>
        Leia os{' '}
        <button type="button" className="link-termos" onClick={() => setTermosAbertos(true)}>
          Termos e Condições
        </button>{' '}
        (versão {termo.versao}).
      </small>
      {termosAbertos && (
        <TermosModal
          termo={termo}
          url={urlTermos || urlTermosPadrao()}
          aoFechar={() => setTermosAbertos(false)}
        />
      )}
    </div>
  );
}
