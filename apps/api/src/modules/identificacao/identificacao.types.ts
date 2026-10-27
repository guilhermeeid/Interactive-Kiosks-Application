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

export interface InformarFidelidadePorQrBody {
  pedidoId: string;
  codigo: string; // id do cadastro de fidelidade, lido do QR Code do cartão
}

export interface UsarPontosBody {
  pedidoId: string;
  pontos: number;
}

export type InformarFidelidadeResponse = ClienteFidelidade;
