import { randomUUID } from 'node:crypto';
import type { ResultadoPagamento } from '@totem/shared';
import type { IniciarPagamentoParams, PagamentoGateway } from './PagamentoGateway';

// Implementação mock/stub de PagamentoGateway: aprova qualquer pagamento
// instantaneamente, sem contato com um adquirente real. Existe para o MVP rodar de
// ponta a ponta antes da integração real (tokenização via SDK do pinpad) existir.
// TODO: implementar adapter real (ex.: Stone, Cielo, PagSeguro) atendendo a
// interface PagamentoGateway, sem alterar apps/api/src/modules/pagamento (US-06).
export class MockPagamentoGateway implements PagamentoGateway {
  private transacoes = new Map<string, ResultadoPagamento>();

  async iniciarPagamento(params: IniciarPagamentoParams): Promise<ResultadoPagamento> {
    const resultado: ResultadoPagamento = {
      transacaoId: randomUUID(),
      formaPagamento: params.formaPagamento,
      status: 'autorizado',
      valorCentavos: params.valorCentavos,
      autorizadoEm: new Date().toISOString(),
    };
    this.transacoes.set(resultado.transacaoId, resultado);
    return resultado;
  }

  async consultarStatus(transacaoId: string): Promise<ResultadoPagamento> {
    const resultado = this.transacoes.get(transacaoId);
    if (!resultado) {
      throw new Error(`Transação "${transacaoId}" não encontrada`);
    }
    return resultado;
  }

  async estornar(transacaoId: string): Promise<void> {
    const resultado = this.transacoes.get(transacaoId);
    if (resultado) {
      resultado.status = 'estornado';
    }
  }
}
