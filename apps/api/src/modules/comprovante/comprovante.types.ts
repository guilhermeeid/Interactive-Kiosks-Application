import type { CanalComprovante, Comprovante } from '@totem/shared';

// DTOs específicos do módulo de comprovante (Épico 4).
export interface EnviarComprovanteBody {
  pedidoId: string;
  canal: CanalComprovante;
  email?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  telefone?: string; // LGPD: dado pessoal — exige consentimento/criptografia
}

export interface DispensarComprovanteBody {
  pedidoId: string;
}

export type EnviarComprovanteResponse = Comprovante;

// Reenvio pedido no balcão: para o contato que já recebeu o comprovante
// (`contatoOriginal`) ou para um contato novo, com a autorização do cliente.
export interface ReenviarComprovanteBody {
  contatoOriginal?: boolean;
  canal?: CanalComprovante;
  email?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  telefone?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  autorizadoPeloCliente?: boolean;
}
