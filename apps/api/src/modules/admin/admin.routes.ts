import { randomUUID } from 'node:crypto';
import type { ConfigTotem } from '@totem/shared';
import type { FastifyInstance } from 'fastify';
import { lerImagem } from '../../db/persistencia';
import { HttpError } from '../../errors';
import { exigirPapel } from './acesso';
import {
  atualizarConfig,
  atualizarCupom,
  atualizarPontosCliente,
  atualizarProduto,
  cadastrarCliente,
  criarCupom,
  criarProduto,
  descartarPendencias,
  enviarImagem,
  excluirCupom,
  listarClientes,
  listarConsentimentos,
  listarCupons,
  listarProdutos,
  obterConfig,
  obterConfigAdmin,
  obterPendencias,
  removerCliente,
  removerProduto,
} from './admin.service';
import type { ClienteBody, CupomBody, EnviarImagemBody, ProdutoBody } from './admin.types';

// Identifica esta execução do servidor. Quando muda, o servidor foi reiniciado (e as
// mudanças do Administrador entraram em vigor): o totem se recarrega na próxima vez que
// voltar à tela inicial.
const VERSAO_SERVIDOR = randomUUID();

// Rotas públicas que o totem lê: a configuração em vigor, as imagens (fotos dos itens,
// logotipo, publicidade) e a versão do servidor.
export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get('/config', async () => {
    return obterConfig();
  });

  app.get('/versao', async () => {
    return { versao: VERSAO_SERVIDOR };
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

// Rotas do modo Administrador (PIN ADMIN_PIN no cabeçalho `x-pin`). Configuração,
// produtos e cupons ficam pendentes até o servidor reiniciar; clientes de fidelidade
// mudam na hora.
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  exigirPapel(app, ['administrador']);

  app.get('/pendencias', async () => {
    return obterPendencias();
  });
  app.delete('/pendencias', async (_request, reply) => {
    await descartarPendencias();
    return reply.status(204).send();
  });

  app.get('/config', async () => {
    return obterConfigAdmin();
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

  // US 29: trilha de auditoria do consentimento
  app.get('/consentimentos', async () => {
    return listarConsentimentos();
  });
}
