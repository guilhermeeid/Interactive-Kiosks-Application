import type { FinalidadeConsentimento, TermoConsentimento } from '@totem/shared';

// US 29: aviso de finalidades exibido antes de qualquer dado pessoal ser digitado, com
// uma caixa de seleção por finalidade. Nada vem marcado: concordar é sempre um gesto do
// cliente, e deixar desmarcado é a recusa.
export interface AvisoConsentimentoProps {
  termo: TermoConsentimento;
  // Finalidades oferecidas nesta tela, na ordem em que aparecem.
  finalidades: FinalidadeConsentimento[];
  aceites: Partial<Record<FinalidadeConsentimento, boolean>>;
  aoMudar: (finalidade: FinalidadeConsentimento, aceito: boolean) => void;
}

export function AvisoConsentimento({ termo, finalidades, aceites, aoMudar }: AvisoConsentimentoProps) {
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
      <small>Termo de privacidade, versão {termo.versao}.</small>
    </div>
  );
}
