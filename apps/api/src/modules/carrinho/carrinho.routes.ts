import type { FastifyInstance } from 'fastify';
import type {
  AdicionarItemCarrinhoBody,
  AtualizarItemCarrinhoBody,
  RemoverItemCarrinhoParams,
} from './carrinho.types';

// Rotas do Épico 1 — Carrinho (revisão/edição do pedido em montagem).
export async function carrinhoRoutes(app: FastifyInstance): Promise<void> {
  // US-03: Revisar/editar carrinho
  app.get<{ Params: { pedidoId: string } }>('/:pedidoId', async (request, reply) => {
    // TODO: implementar handler chamando obterCarrinho(request.params.pedidoId).
    return reply.notImplemented();
  });

  // US-02: Adicionar ao carrinho
  app.post<{ Body: AdicionarItemCarrinhoBody }>('/itens', async (request, reply) => {
    // TODO: implementar handler chamando adicionarItem(request.body).
    return reply.notImplemented();
  });

  // US-03: Revisar/editar carrinho (alterar quantidade)
  app.patch<{ Body: AtualizarItemCarrinhoBody }>('/itens', async (request, reply) => {
    // TODO: implementar handler chamando atualizarItem(request.body).
    return reply.notImplemented();
  });

  // US-03: Revisar/editar carrinho (remover item)
  app.delete<{ Params: RemoverItemCarrinhoParams }>(
    '/:pedidoId/itens/:itemCardapioId',
    async (request, reply) => {
      // TODO: implementar handler chamando removerItem(request.params).
      return reply.notImplemented();
    },
  );
}
