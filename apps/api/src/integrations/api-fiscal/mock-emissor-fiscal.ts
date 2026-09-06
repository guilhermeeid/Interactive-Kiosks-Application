import type {
  EmissorFiscal,
  EmitirNotaFiscalParams,
  NotaFiscalEmitida,
} from './EmissorFiscal';

// Implementação mock/stub de EmissorFiscal, usada em desenvolvimento e testes
// enquanto o provedor real de emissão fiscal não é integrado.
// TODO: implementar adapter real (ex.: provedor de NFC-e do estado/município)
// atendendo a interface EmissorFiscal, sem alterar apps/api/src/modules/comprovante (US-08).
export class MockEmissorFiscal implements EmissorFiscal {
  async emitirNotaFiscal(params: EmitirNotaFiscalParams): Promise<NotaFiscalEmitida> {
    // TODO: implementar emissão fiscal real.
    throw new Error('MockEmissorFiscal.emitirNotaFiscal não implementado');
  }
}
