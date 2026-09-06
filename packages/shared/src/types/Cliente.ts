// Tipos referentes à identificação do cliente (fidelidade + CPF na nota).
// Consumido por: apps/api/src/modules/identificacao, apps/totem/src/screens/Identificacao (US-04, US-05).

// LGPD: dado pessoal — exige consentimento/criptografia
export interface ClienteFidelidade {
  id: string;
  numeroFidelidade: string; // LGPD: dado pessoal — exige consentimento/criptografia
  pontos: number;
}

export interface IdentificacaoCliente {
  numeroFidelidade?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  cpfNaNota?: string; // LGPD: dado pessoal — exige consentimento/criptografia
}
