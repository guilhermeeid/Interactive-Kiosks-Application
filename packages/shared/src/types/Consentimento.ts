// Tipos do consentimento LGPD (US 29): o termo exibido ao cliente antes de qualquer dado
// pessoal ser guardado e o registro de auditoria de cada decisão.
// Consumido por: apps/api/src/modules/consentimento, apps/totem (Identificação,
// Comprovante e aba Privacidade do administrador).

// Cada finalidade é consentida (ou recusada) separadamente.
export type FinalidadeConsentimento = 'cpf_nota' | 'fidelidade' | 'comprovante';

export interface TermoConsentimento {
  versao: string;
  aviso: string; // texto geral, exibido acima das caixas de seleção
  // Texto da caixa de seleção de cada finalidade ("Concordo em ...").
  finalidades: Record<FinalidadeConsentimento, string>;
}

// Uma linha da trilha de auditoria: qual decisão, sobre qual finalidade, em que data e
// hora e diante de qual versão do termo. Não guarda o dado pessoal em si.
export interface RegistroConsentimento {
  id: string;
  pedidoId: string;
  finalidade: FinalidadeConsentimento;
  aceito: boolean;
  versaoTermo: string;
  registradoEm: string; // ISO 8601 (data e hora)
}
