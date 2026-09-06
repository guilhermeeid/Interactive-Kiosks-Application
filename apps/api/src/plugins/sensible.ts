import sensible from '@fastify/sensible';
import type { FastifyInstance } from 'fastify';

// Plugin utilitário do Fastify (httpErrors, asserts, etc.) usado pelos módulos de negócio.
export async function registerSensible(app: FastifyInstance): Promise<void> {
  await app.register(sensible);
}
