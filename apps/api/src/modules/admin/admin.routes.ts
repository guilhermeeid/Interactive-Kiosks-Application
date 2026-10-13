import { timingSafeEqual } from 'node:crypto';
import type { ConfigTotem } from '@totem/shared';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { lerImagem } from '../../db/persistencia';
import { HttpError } from '../../errors';
import {
  atualizarConfig,
  atualizarCupom,
  atualizarPontosCliente,
  atualizarProduto,
  cadastrarCliente,
  confirmarEntrega,
  criarCupom,
  criarProduto,
  enviarImagem,
  excluirCupom,
  listarClientes,
  listarConsentimentos,
  listarCupons,
  listarPedidosAguardando,
  listarProdutos,
  obterConfig,
  removerCliente,
  removerProduto,
} from './admin.service';
import type { ClienteBody, CupomBody, EnviarImagemBody, ProdutoBody } from './admin.types';

// Rotas públicas que o totem lê ao iniciar: a configuração definida pelo administrador
// e as imagens (fotos dos itens e logotipo) enviadas por ele.
export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get('/config', async () => {
    return obterConfig();
  });

  app.get<{ Params: { arquivo: string } }>('/imagens/:arquivo', async (request, reply) => {
    const imagem = lerImagem(request.params.arquivo);
    if (!imagem) {
      throw new HttpError(404, 'Imagem não encontrada');
    }
    return reply
      .type(imagem.tipo)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .send(imagem.conteudo);
  });
}

function pinConfere(recebido: unknown, esperado: string): boolean {
  if (typeof recebido !== 'string') {
    return false;
  }
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Rotas da tela de administrador. Todas exigem o PIN (variável ADMIN_PIN) no cabeçalho
// `x-admin-pin`. É uma trava simples para esta fase, não um login com usuários.
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const { adminPin } = loadEnv();

  app.addHook('onRequest', async (request) => {
    if (!pinConfere(request.headers['x-admin-pin'], adminPin)) {
      throw new HttpError(401, 'PIN de administrador incorreto');
    }
  });

  // Usada pela tela de entrada para conferir o PIN.
  app.get('/sessao', async (_request, reply) => {
    return reply.status(204).send();
  });

  app.put<{ Body: ConfigTotem }>('/config', async (request) => {
    return atualizarConfig(request.body);
  });

  // A imagem chega já reduzida pelo navegador, em base64; o limite de corpo é maior
  // que o padrão (1 MB) só nesta rota.
  app.post<{ Body: EnviarImagemBody }>(
    '/imagens',
    { bodyLimit: 4 * 1024 * 1024 },
    async (request) => {
      return enviarImagem(request.body);
    },
  );

  app.get('/produtos', async () => {
    return listarProdutos();
  });
  app.post<{ Body: ProdutoBody }>('/produtos', async (request) => {
    return criarProduto(request.body);
  });
  app.put<{ Params: { id: string }; Body: ProdutoBody }>('/produtos/:id', async (request) => {
    return atualizarProduto(request.params.id, request.body);
  });
  app.delete<{ Params: { id: string } }>('/produtos/:id', async (request, reply) => {
    await removerProduto(request.params.id);
    return reply.status(204).send();
  });

  app.get('/cupons', async () => {
    return listarCupons();
  });
  app.post<{ Body: CupomBody }>('/cupons', async (request) => {
    return criarCupom(request.body);
  });
  app.put<{ Params: { codigo: string }; Body: CupomBody }>('/cupons/:codigo', async (request) => {
    return atualizarCupom(request.params.codigo, request.body);
  });
  app.delete<{ Params: { codigo: string } }>('/cupons/:codigo', async (request, reply) => {
    await excluirCupom(request.params.codigo);
    return reply.status(204).send();
  });

  // LGPD: dado pessoal — exige consentimento/criptografia (CPF dos clientes)
  app.get('/clientes', async () => {
    return listarClientes();
  });
  app.post<{ Body: ClienteBody }>('/clientes', async (request) => {
    return cadastrarCliente(request.body);
  });
  app.put<{ Params: { id: string }; Body: Pick<ClienteBody, 'pontos'> }>(
    '/clientes/:id',
    async (request) => {
      return atualizarPontosCliente(request.params.id, request.body);
    },
  );
  app.delete<{ Params: { id: string } }>('/clientes/:id', async (request, reply) => {
    await removerCliente(request.params.id);
    return reply.status(204).send();
  });

  app.get('/pedidos', async () => {
    return listarPedidosAguardando();
  });
  app.post<{ Params: { id: string } }>('/pedidos/:id/entregar', async (request, reply) => {
    await confirmarEntrega(request.params.id);
    return reply.status(204).send();
  });

  // US 29: trilha de auditoria do consentimento
  app.get('/consentimentos', async () => {
    return listarConsentimentos();
  });
}
