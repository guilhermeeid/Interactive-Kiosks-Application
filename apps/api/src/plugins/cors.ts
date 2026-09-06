import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

// Plugin de CORS: libera o frontend do totem (apps/totem) a consumir a API.
// TODO: restringir `origin` para o(s) domínio(s)/host(s) do totem em produção.
export async function registerCors(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: true,
  });
}
