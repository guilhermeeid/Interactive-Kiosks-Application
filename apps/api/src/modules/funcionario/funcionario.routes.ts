import type { FastifyInstance } from 'fastify';
import { MockEmissorFiscal } from '../../integrations/api-fiscal';
import { exigirPapel } from '../admin/acesso';
import { enviarImagem } from '../admin/admin.service';
import type { EnviarImagemBody, ProdutoAoVivoBody } from '../admin/admin.types';
import {
  atualizarProdutoAoVivo,
  cancelarPedidoNoCaixa,
  confirmarEntrega,
  listarPedidosAguardando,
  listarProdutosAoVivo,
  receberPagamentoNoCaixa,
} from './funcionario.service';

// Rotas do modo Funcionário (o Administrador também pode usá-las). O que muda aqui vale
// na hora.
export async function funcionarioRoutes(app: FastifyInstance): Promise<void> {
  exigirPapel(app, ['administrador', 'funcionario']);
  // TODO: injeção de dependência quando o emissor fiscal real existir.
  const emissorFiscal = new MockEmissorFiscal();

  app.get('/produtos', async () => {
    return listarProdutosAoVivo();
  });
  app.patch<{ Params: { id: string }; Body: ProdutoAoVivoBody }>(
    '/produtos/:id',
    async (request) => {
      return atualizarProdutoAoVivo(request.params.id, request.body);
    },
  );

  // Foto nova de um produto; chega já reduzida pelo navegador.
  app.post<{ Body: EnviarImagemBody }>(
    '/imagens',
    { bodyLimit: 4 * 1024 * 1024 },
    async (request) => {
      return enviarImagem(request.body);
    },
  );

  app.get('/pedidos', async () => {
    return listarPedidosAguardando();
  });
  app.post<{ Params: { id: string } }>('/pedidos/:id/receber', async (request) => {
    return receberPagamentoNoCaixa(request.params.id, emissorFiscal);
  });
  app.post<{ Params: { id: string } }>('/pedidos/:id/cancelar', async (request, reply) => {
    await cancelarPedidoNoCaixa(request.params.id);
    return reply.status(204).send();
  });
  app.post<{ Params: { id: string } }>('/pedidos/:id/entregar', async (request, reply) => {
    await confirmarEntrega(request.params.id);
    return reply.status(204).send();
  });
}
