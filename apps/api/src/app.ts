import Fastify, { type FastifyInstance } from 'fastify';
import { registerCors } from './plugins/cors';
import { registerSensible } from './plugins/sensible';
import { cardapioRoutes } from './modules/cardapio';
import { carrinhoRoutes } from './modules/carrinho';
import { identificacaoRoutes } from './modules/identificacao';
import { pagamentoRoutes } from './modules/pagamento';
import { cupomRoutes } from './modules/cupom';
import { comprovanteRoutes } from './modules/comprovante';

// Monta a instância do Fastify: plugins de infraestrutura + rotas de cada módulo de
// negócio do tier Básico (um por Épico do backlog).
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await registerSensible(app);
  await registerCors(app);

  // Épico 1 — Cardápio Digital e Carrinho
  await app.register(cardapioRoutes, { prefix: '/cardapio' });
  await app.register(carrinhoRoutes, { prefix: '/carrinho' });

  // Épico 2 — Identificação do Cliente
  await app.register(identificacaoRoutes, { prefix: '/identificacao' });

  // Épico 3 — Pagamento e Cupons
  await app.register(pagamentoRoutes, { prefix: '/pagamento' });
  await app.register(cupomRoutes, { prefix: '/cupom' });

  // Épico 4 — Emissão de Comprovante
  await app.register(comprovanteRoutes, { prefix: '/comprovante' });

  return app;
}
