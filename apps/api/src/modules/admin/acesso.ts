import { timingSafeEqual } from 'node:crypto';
import type { PapelAcesso } from '@totem/shared';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { HttpError } from '../../errors';

// Item 7: a área restrita tem dois papéis, cada um com o seu PIN (ADMIN_PIN e
// FUNCIONARIO_PIN), enviado no cabeçalho `x-pin`. É uma trava simples para esta fase,
// não um login com usuários.

function pinConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function papelDoPin(pin: unknown): PapelAcesso | null {
  if (typeof pin !== 'string' || !pin) {
    return null;
  }
  const { adminPin, funcionarioPin } = loadEnv();
  if (pinConfere(pin, adminPin)) {
    return 'administrador';
  }
  if (pinConfere(pin, funcionarioPin)) {
    return 'funcionario';
  }
  return null;
}

// Recusa, em todas as rotas do plugin, quem não tem um dos papéis aceitos.
export function exigirPapel(app: FastifyInstance, aceitos: PapelAcesso[]): void {
  app.addHook('onRequest', async (request) => {
    const papel = papelDoPin(request.headers['x-pin']);
    if (!papel) {
      throw new HttpError(401, 'PIN incorreto');
    }
    if (!aceitos.includes(papel)) {
      throw new HttpError(403, 'Esta ação é do modo Administrador');
    }
  });
}

// Usada pela tela de entrada para conferir o PIN e saber o papel.
export async function acessoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (request) => {
    const papel = papelDoPin(request.headers['x-pin']);
    if (!papel) {
      throw new HttpError(401, 'PIN incorreto');
    }
    return { papel };
  });
}
