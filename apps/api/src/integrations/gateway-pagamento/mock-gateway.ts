import type { ResultadoPagamento } from '@totem/shared';
import type {
  IniciarPagamentoParams,
  PagamentoGateway,
} from './PagamentoGateway';

// Implementação mock/stub de PagamentoGateway, usada em desenvolvimento e testes
// enquanto o provedor real (adquirente) não é integrado.
// TODO: implementar adapter real (ex.: Stone, Cielo, PagSeguro) atendendo a
// interface PagamentoGateway, sem alterar apps/api/src/modules/pagamento (US-06).
export class MockPagamentoGateway implements PagamentoGateway {
  async iniciarPagamento(params: IniciarPagamentoParams): Promise<ResultadoPagamento> {
    // TODO: implementar chamada real ao gateway de pagamento.
    throw new Error('MockPagamentoGateway.iniciarPagamento não implementado');
  }

  async consultarStatus(transacaoId: string): Promise<ResultadoPagamento> {
    // TODO: implementar consulta real de status da transação.
    throw new Error('MockPagamentoGateway.consultarStatus não implementado');
  }

  async estornar(transacaoId: string): Promise<void> {
    // TODO: implementar estorno real junto ao gateway.
    throw new Error('MockPagamentoGateway.estornar não implementado');
  }
}
