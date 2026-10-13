import type { FastifyInstance } from 'fastify';
import { aplicarCupom, removerCupom } from './cupom.service';
import type { AplicarCupomBody } from './cupom.types';

// Rotas do Épico 3 — Cupons.
export async function cupomRoutes(app: FastifyInstance): Promise<void> {
  // US 13: Aplicar cupom de desconto
  app.post<{ Body: AplicarCupomBody }>('/aplicar', async (request) => {
    return aplicarCupom(request.body);
  });

  // Remover o cupom aplicado ao pedido
  app.delete<{ Params: { pedidoId: string } }>('/:pedidoId', async (request) => {
    return removerCupom(request.params.pedidoId);
  });
}
