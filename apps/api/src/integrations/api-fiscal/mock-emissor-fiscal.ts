import { randomUUID } from 'node:crypto';
import type { EmissorFiscal, EmitirNotaFiscalParams, NotaFiscalEmitida } from './EmissorFiscal';

// Implementação mock/stub de EmissorFiscal: gera um número de nota fictício, sem
// contato com um provedor fiscal real. Existe para o MVP rodar de ponta a ponta
// antes da integração real existir.
// TODO: implementar adapter real (ex.: provedor de NFC-e do estado/município)
// atendendo a interface EmissorFiscal, sem alterar apps/api/src/modules/comprovante (US-08).
export class MockEmissorFiscal implements EmissorFiscal {
  async emitirNotaFiscal(params: EmitirNotaFiscalParams): Promise<NotaFiscalEmitida> {
    const numero = randomUUID().slice(0, 8).toUpperCase();
    return {
      pedidoId: params.pedido.id,
      numero,
      urlDanfe: `https://mock-fiscal.local/danfe/${numero}`,
      emitidaEm: new Date().toISOString(),
    };
  }
}
