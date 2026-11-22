import type { FastifyInstance } from 'fastify';
import {
  autenticar,
  criarUsuario,
  desbloquearUsuario,
  entrar,
  exigirPapel,
  listarUsuarios,
  redefinirSenha,
  removerUsuario,
  sair,
  tokenDoCabecalho,
  usuarioDaRequisicao,
} from './acesso.service';
import type { CriarUsuarioBody, EntrarBody, RedefinirSenhaBody } from './acesso.types';

// Card E / US 35: entrada no painel. Públicas: entrar devolve o token da sessão, que vai
// no cabeçalho `Authorization: Bearer <token>` das demais chamadas.
export async function acessoRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: EntrarBody }>('/entrar', async (request) => {
    return entrar(request.body);
  });

  // Confere a sessão e conta como atividade: a tela chama isto quando o usuário mexe
  // nela, para a sessão não expirar enquanto ele preenche um formulário longo.
  app.get('/sessao', async (request) => {
    return autenticar(tokenDoCabecalho(request.headers.authorization), true);
  });

  app.post('/sair', async (request, reply) => {
    sair(tokenDoCabecalho(request.headers.authorization));
    return reply.status(204).send();
  });
}

// Card E / US 35: usuários do painel e seus perfis. Só o Administrador gerencia; vale na
// hora (não fica pendente até o reinício).
export async function usuariosRoutes(app: FastifyInstance): Promise<void> {
  exigirPapel(app, ['administrador']);

  app.get('/', async () => {
    return listarUsuarios();
  });
  app.post<{ Body: CriarUsuarioBody }>('/', async (request) => {
    return criarUsuario(request.body);
  });
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await removerUsuario(request.params.id, usuarioDaRequisicao(request));
    return reply.status(204).send();
  });
  app.put<{ Params: { id: string }; Body: RedefinirSenhaBody }>('/:id/senha', async (request) => {
    return redefinirSenha(
      request.params.id,
      request.body,
      tokenDoCabecalho(request.headers.authorization),
    );
  });
  app.post<{ Params: { id: string } }>('/:id/desbloquear', async (request) => {
    return desbloquearUsuario(request.params.id);
  });
}
