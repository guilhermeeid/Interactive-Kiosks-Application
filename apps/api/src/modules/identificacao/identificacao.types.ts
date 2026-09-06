import type { ClienteFidelidade } from '@totem/shared';

// DTOs específicos do módulo de identificação do cliente (Épico 2).
export interface InformarFidelidadeBody {
  pedidoId: string;
  numeroFidelidade: string; // LGPD: dado pessoal — exige consentimento/criptografia
}

export interface InformarCpfNotaBody {
  pedidoId: string;
  cpf: string; // LGPD: dado pessoal — exige consentimento/criptografia
}

export type InformarFidelidadeResponse = ClienteFidelidade;
