import type { FinalidadeConsentimento } from '@totem/shared';

// DTOs do módulo de consentimento LGPD (US 29).
export interface RegistrarConsentimentosBody {
  pedidoId: string;
  versaoTermo: string; // versão do termo que o cliente viu na tela
  // Decisão para cada finalidade apresentada: true = concordou, false = recusou.
  decisoes: Partial<Record<FinalidadeConsentimento, boolean>>;
}
