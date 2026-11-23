import type { FastifyInstance } from 'fastify';
import { emissorFiscal, servicoNotificacao } from '../../integrations/instancias';
import { exigirPapel } from '../admin/acesso';
import { reemitirNota, reenviarComprovante } from '../comprovante/comprovante.service';
import type { ReenviarComprovanteBody } from '../comprovante/comprovante.types';
import { enviarImagem } from '../admin/admin.service';
import type { EnviarImagemBody, ProdutoAoVivoBody } from '../admin/admin.types';
import {
  atualizarProdutoAoVivo,
  cancelarPedidoNoCaixa,
  confirmarEntrega,
  consultarPedidos,
  listarPedidosAguardando,
  listarProdutosAoVivo,
  receberPagamentoNoCaixa,
} from './funcionario.service';

// Rotas do modo Funcionário (o Administrador também pode usá-las). O que muda aqui vale
// na hora.
export async function funcionarioRoutes(app: FastifyInstance): Promise<void> {
  exigirPapel(app, ['administrador', 'funcionario']);

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

  // Consulta de pedidos (período, situação da nota e forma de pagamento na query).
  // LGPD: CPF e contatos voltam mascarados.
  app.get<{ Querystring: Record<string, unknown> }>('/historico', async (request) => {
    return consultarPedidos(request.query);
  });
  // Reenvio do comprovante, a pedido do cliente no balcão
  // LGPD: dado pessoal — exige consentimento/criptografia (email/telefone no body)
  app.post<{ Params: { id: string }; Body: ReenviarComprovanteBody }>(
    '/historico/:id/reenviar',
    async (request) => {
      return reenviarComprovante(request.params.id, request.body, servicoNotificacao);
    },
  );
  // Nova tentativa de emitir a NFC-e que falhou
  app.post<{ Params: { id: string } }>('/historico/:id/nota', async (request) => {
    return reemitirNota(request.params.id, emissorFiscal);
  });
}
