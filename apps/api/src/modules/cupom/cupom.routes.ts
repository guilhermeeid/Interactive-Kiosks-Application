import type { FastifyInstance } from 'fastify';
import type { AplicarCupomBody } from './cupom.types';

// Rotas do Épico 3 — Cupons.
export async function cupomRoutes(app: FastifyInstance): Promise<void> {
  // US-07: Aplicar cupom
  app.post<{ Body: AplicarCupomBody }>('/aplicar', async (request, reply) => {
    // TODO: implementar handler chamando aplicarCupom(request.body).
    return reply.notImplemented();
  });
}
