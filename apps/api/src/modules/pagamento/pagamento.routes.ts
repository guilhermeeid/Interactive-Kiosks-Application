import type { FastifyInstance } from 'fastify';
import { MockPagamentoGateway } from '../../integrations/gateway-pagamento';
import { escolherFormaPagamento } from './pagamento.service';
import type { EscolherFormaPagamentoBody } from './pagamento.types';

// Rotas do Épico 3 — Pagamento.
export async function pagamentoRoutes(app: FastifyInstance): Promise<void> {
  // TODO: substituir a instanciação direta por injeção de dependência quando o
  // provedor real de PagamentoGateway (ver integrations/gateway-pagamento) existir.
  const gateway = new MockPagamentoGateway();

  // US-06: Escolher forma de pagamento
  app.post<{ Body: EscolherFormaPagamentoBody }>('/', async (request) => {
    return escolherFormaPagamento(request.body, gateway);
  });
}
