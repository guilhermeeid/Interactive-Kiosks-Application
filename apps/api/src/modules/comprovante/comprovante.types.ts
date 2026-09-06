import type { CanalComprovante, Comprovante } from '@totem/shared';

// DTOs específicos do módulo de comprovante (Épico 4).
export interface EnviarComprovanteBody {
  pedidoId: string;
  canal: CanalComprovante;
  email?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  telefone?: string; // LGPD: dado pessoal — exige consentimento/criptografia
}

export type EnviarComprovanteResponse = Comprovante;
