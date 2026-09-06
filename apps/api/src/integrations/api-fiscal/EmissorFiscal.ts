import type { Pedido } from '@totem/shared';

// Contrato de integração com o provedor de emissão fiscal (NF-e/NFC-e).
// Consumido por: apps/api/src/modules/comprovante (US-08).
export interface EmitirNotaFiscalParams {
  pedido: Pedido;
  cpfNaNota?: string; // LGPD: dado pessoal — exige consentimento/criptografia
}

export interface NotaFiscalEmitida {
  pedidoId: string;
  numero: string;
  urlDanfe: string;
  emitidaEm: string;
}

export interface EmissorFiscal {
  emitirNotaFiscal(params: EmitirNotaFiscalParams): Promise<NotaFiscalEmitida>;
}
