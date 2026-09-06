import type { FastifyInstance } from 'fastify';
import { listarCardapio } from './cardapio.service';
import type { ListarCardapioQuery } from './cardapio.types';

// Rotas do Épico 1 — Cardápio Digital.
export async function cardapioRoutes(app: FastifyInstance): Promise<void> {
  // US-01: Visualizar cardápio
  app.get<{ Querystring: ListarCardapioQuery }>('/', async (request, reply) => {
    // TODO: implementar handler chamando listarCardapio(request.query).
    return reply.notImplemented();
  });
}
