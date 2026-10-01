import type { FastifyInstance } from 'fastify';
import { aplicarCupom } from './cupom.service';
import type { AplicarCupomBody } from './cupom.types';

// Rotas do Épico 3 — Cupons.
export async function cupomRoutes(app: FastifyInstance): Promise<void> {
  // US 13: Aplicar cupom de desconto
  app.post<{ Body: AplicarCupomBody }>('/aplicar', async (request) => {
    return aplicarCupom(request.body);
  });
}
