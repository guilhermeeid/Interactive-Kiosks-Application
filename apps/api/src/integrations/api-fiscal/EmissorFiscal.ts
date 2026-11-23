import type { Pedido } from '@totem/shared';

// Contrato de integração com o provedor de emissão fiscal (NFC-e).
// Consumido por: apps/api/src/modules/comprovante (US-08 / US 15).
export interface EmitirNotaFiscalParams {
  pedido: Pedido;
  cpfNaNota?: string; // LGPD: dado pessoal — exige consentimento/criptografia
}

export interface NotaFiscalEmitida {
  pedidoId: string;
  numero: string;
  serie: string;
  chaveAcesso: string; // 44 dígitos
  // Conteúdo do QR Code impresso/exibido na NFC-e: consulta pública da nota na SEFAZ.
  urlConsulta: string;
  // US 09: CPF que consta na nota emitida; ausente em nota sem identificação do consumidor.
  cpfDestinatario?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  urlDanfe: string;
  emitidaEm: string;
}

// Erro de emissão (rejeição da SEFAZ, provedor fora do ar, tempo esgotado). O pedido
// segue concluído; a falha é registrada e a emissão pode ser refeita.
export class ErroFiscal extends Error {}

export interface EmissorFiscal {
  // Autoriza a NFC-e ou lança erro (de preferência ErroFiscal, com o motivo).
  emitirNotaFiscal(params: EmitirNotaFiscalParams): Promise<NotaFiscalEmitida>;
}
