import type { FastifyInstance } from 'fastify';
import { adicionarItem, atualizarItem, obterCarrinho, removerItem } from './carrinho.service';
import type {
  AdicionarItemCarrinhoBody,
  AtualizarItemCarrinhoBody,
  RemoverItemCarrinhoParams,
} from './carrinho.types';

// Rotas do Épico 1 — Carrinho (revisão/edição do pedido em montagem).
export async function carrinhoRoutes(app: FastifyInstance): Promise<void> {
  // US-03: Revisar/editar carrinho
  app.get<{ Params: { pedidoId: string } }>('/:pedidoId', async (request) => {
    return obterCarrinho(request.params.pedidoId);
  });

  // US-02: Adicionar ao carrinho
  app.post<{ Body: AdicionarItemCarrinhoBody }>('/itens', async (request) => {
    return adicionarItem(request.body);
  });

  // US-03: Revisar/editar carrinho (alterar quantidade)
  app.patch<{ Body: AtualizarItemCarrinhoBody }>('/itens', async (request) => {
    return atualizarItem(request.body);
  });

  // US-03: Revisar/editar carrinho (remover item)
  app.delete<{ Params: RemoverItemCarrinhoParams }>(
    '/:pedidoId/itens/:itemCardapioId',
    async (request) => {
      return removerItem(request.params);
    },
  );
}
