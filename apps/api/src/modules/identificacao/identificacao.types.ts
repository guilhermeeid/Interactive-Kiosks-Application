import type { ClienteFidelidade } from '@totem/shared';

// DTOs específicos do módulo de identificação do cliente (Épico 2).
export interface InformarFidelidadeBody {
  pedidoId: string;
  numeroFidelidade: string; // LGPD: dado pessoal — exige consentimento/criptografia
}

export interface ConsultarCpfBody {
  cpf: string; // LGPD: dado pessoal — exige consentimento/criptografia
  // true quando o cliente marcou a finalidade "fidelidade" no termo de consentimento.
  fidelidade?: boolean;
}

export interface InformarCpfNotaBody {
  pedidoId: string;
  cpf: string; // LGPD: dado pessoal — exige consentimento/criptografia
}

export interface PularIdentificacaoBody {
  pedidoId: string;
  versaoTermo: string; // versão do termo de consentimento exibido ao cliente
}

export interface UsarPontosBody {
  pedidoId: string;
  pontos: number;
}

export type InformarFidelidadeResponse = ClienteFidelidade;
