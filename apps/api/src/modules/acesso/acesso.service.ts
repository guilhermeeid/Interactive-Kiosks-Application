import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PapelAcesso, SessaoPainel, UsuarioPainel } from '@totem/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { persistir, usuariosPainel } from '../../db/memory-store';
import type { UsuarioPainelSalvo } from '../../db/persistencia';
import { HttpError } from '../../errors';
import { texto } from '../admin/validacao';
import type { CriarUsuarioBody, EntrarBody, RedefinirSenhaBody } from './acesso.types';
import { gerarHashSenha, senhaConfere, validarSenhaNova } from './senha';

// Card E / US 35: acesso ao painel por usuário e senha, com perfil (Administrador ou
// Funcionário) que define o que cada um pode fazer.
// - Senha guardada só como hash bcrypt (ver ./senha.ts).
// - 5 senhas erradas seguidas bloqueiam aquele login por 15 minutos.
// - A sessão é um token aleatório; ela termina sozinha depois de 30 minutos sem uso, ao
//   sair, ao trocar a senha do usuário ou ao removê-lo. O servidor guarda só o hash do
//   token, e as sessões ficam em memória: reiniciar o servidor pede login de novo.
//   (Um token opaco, e não um JWT, porque a expiração é por inatividade e a sessão
//   precisa poder ser encerrada na hora — com JWT isso exigiria uma lista no servidor
//   do mesmo jeito.)

export const FALHAS_PARA_BLOQUEIO = 5;
export const BLOQUEIO_MINUTOS = 15;
export const INATIVIDADE_MAXIMA_MINUTOS = 30;
const MINUTO = 60_000;

const PAPEIS: PapelAcesso[] = ['administrador', 'funcionario'];
const LOGIN_VALIDO = /^[a-z0-9._-]{3,30}$/;

function normalizarLogin(login: unknown): string {
  return typeof login === 'string' ? login.trim().toLowerCase() : '';
}

function buscarPorLogin(login: string): UsuarioPainelSalvo | undefined {
  return [...usuariosPainel.values()].find((usuario) => usuario.login === login);
}

// ---------- Bloqueio por senhas erradas ----------

// Por login digitado, exista ele ou não: assim a resposta não revela quais logins
// existem. Fica só em memória.
interface Tentativas {
  falhas: number;
  bloqueadoAte?: number;
}
const tentativas = new Map<string, Tentativas>();

function bloqueadoAte(login: string, agora: number): number | undefined {
  const ate = tentativas.get(login)?.bloqueadoAte;
  return ate !== undefined && ate > agora ? ate : undefined;
}

function erroBloqueio(ate: number, agora: number): HttpError {
  const minutos = Math.ceil((ate - agora) / MINUTO);
  return new HttpError(
    429,
    `Acesso bloqueado por senhas erradas. Tente de novo em ${minutos} minuto${minutos === 1 ? '' : 's'}.`,
  );
}

// Conta mais uma senha errada; a quinta seguida bloqueia o login.
function registrarFalha(login: string, agora: number): HttpError {
  const falhas = (tentativas.get(login)?.falhas ?? 0) + 1;
  if (falhas >= FALHAS_PARA_BLOQUEIO) {
    tentativas.set(login, { falhas: 0, bloqueadoAte: agora + BLOQUEIO_MINUTOS * MINUTO });
    return new HttpError(
      429,
      `Senha errada ${FALHAS_PARA_BLOQUEIO} vezes seguidas. Acesso bloqueado por ${BLOQUEIO_MINUTOS} minutos.`,
    );
  }
  tentativas.set(login, { falhas });
  const restam = FALHAS_PARA_BLOQUEIO - falhas;
  return new HttpError(
    401,
    `Usuário ou senha incorretos. ${restam === 1 ? 'Resta 1 tentativa' : `Restam ${restam} tentativas`} antes do bloqueio.`,
  );
}

function publico(usuario: UsuarioPainelSalvo, agora: number): UsuarioPainel {
  const ate = bloqueadoAte(usuario.login, agora);
  return {
    id: usuario.id,
    login: usuario.login,
    nome: usuario.nome,
    papel: usuario.papel,
    criadoEm: usuario.criadoEm,
    ...(ate !== undefined && { bloqueadoAte: new Date(ate).toISOString() }),
  };
}

// ---------- Sessões ----------

interface Sessao {
  usuarioId: string;
  ultimaAtividade: number;
}
// Chave: SHA-256 do token. Quem lesse esta lista não conseguiria usar as sessões.
const sessoes = new Map<string, Sessao>();

function chaveDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sessaoExpirada(sessao: Sessao, agora: number): boolean {
  return agora - sessao.ultimaAtividade > INATIVIDADE_MAXIMA_MINUTOS * MINUTO;
}

function encerrarSessoesDoUsuario(usuarioId: string, exceto?: string): void {
  for (const [chave, sessao] of sessoes) {
    if (sessao.usuarioId === usuarioId && chave !== exceto) {
      sessoes.delete(chave);
    }
  }
}

// Comparar com um hash qualquer quando o login não existe faz a resposta levar o mesmo
// tempo nos dois casos.
let hashFalso: Promise<string> | undefined;
function obterHashFalso(): Promise<string> {
  hashFalso ??= gerarHashSenha(randomBytes(16).toString('hex'));
  return hashFalso;
}

export async function entrar(body: EntrarBody, agora = Date.now()): Promise<SessaoPainel> {
  const login = normalizarLogin(body?.login);
  const senha = typeof body?.senha === 'string' ? body.senha : '';
  if (!login || !senha) {
    throw new HttpError(400, 'Informe o usuário e a senha');
  }
  // Bloqueado, nem a senha certa entra.
  const ate = bloqueadoAte(login, agora);
  if (ate !== undefined) {
    throw erroBloqueio(ate, agora);
  }

  const usuario = buscarPorLogin(login);
  const confere = await senhaConfere(senha, usuario?.senhaHash ?? (await obterHashFalso()));
  if (!usuario || !confere) {
    throw registrarFalha(login, agora);
  }
  tentativas.delete(login);

  // Aproveita a entrada para esquecer as sessões que já expiraram.
  for (const [chave, sessao] of sessoes) {
    if (sessaoExpirada(sessao, agora)) {
      sessoes.delete(chave);
    }
  }
  const token = randomBytes(32).toString('base64url');
  sessoes.set(chaveDoToken(token), { usuarioId: usuario.id, ultimaAtividade: agora });
  return {
    token,
    usuario: publico(usuario, agora),
    inatividadeMaximaMinutos: INATIVIDADE_MAXIMA_MINUTOS,
  };
}

export function tokenDoCabecalho(authorization: unknown): string {
  if (typeof authorization !== 'string') {
    return '';
  }
  const [tipo, token] = authorization.split(' ');
  return tipo === 'Bearer' && token ? token : '';
}

// Confere a sessão e devolve o usuário dela. `renovar` conta a chamada como atividade
// (reinicia a contagem dos 30 minutos).
export function autenticar(token: string, renovar: boolean, agora = Date.now()): UsuarioPainel {
  const chave = token ? chaveDoToken(token) : '';
  const sessao = chave ? sessoes.get(chave) : undefined;
  if (!sessao) {
    throw new HttpError(401, 'Entre com seu usuário e senha para continuar');
  }
  if (sessaoExpirada(sessao, agora)) {
    sessoes.delete(chave);
    throw new HttpError(401, 'Sessão encerrada por inatividade. Entre de novo.');
  }
  const usuario = usuariosPainel.get(sessao.usuarioId);
  if (!usuario) {
    sessoes.delete(chave);
    throw new HttpError(401, 'Este usuário foi removido. Entre com outro usuário.');
  }
  if (renovar) {
    sessao.ultimaAtividade = agora;
  }
  return publico(usuario, agora);
}

export function sair(token: string): void {
  if (token) {
    sessoes.delete(chaveDoToken(token));
  }
}

// ---------- Permissões por perfil ----------

const usuarioPorRequisicao = new WeakMap<FastifyRequest, UsuarioPainel>();

// Recusa, em todas as rotas do plugin, quem não está logado (401) ou tem um perfil sem
// acesso a elas (403).
export function exigirPapel(app: FastifyInstance, aceitos: PapelAcesso[]): void {
  app.addHook('onRequest', async (request) => {
    // Atualizações automáticas da tela (ex.: a lista de pedidos, a cada 15 s) não contam
    // como atividade: sem isso, uma aba esquecida aberta manteria a sessão viva.
    const renovar = request.headers['x-atividade'] !== 'automatica';
    const usuario = autenticar(tokenDoCabecalho(request.headers.authorization), renovar);
    if (!aceitos.includes(usuario.papel)) {
      throw new HttpError(403, 'Seu perfil não tem acesso a esta área');
    }
    usuarioPorRequisicao.set(request, usuario);
  });
}

// Quem fez a requisição (já conferido por `exigirPapel`).
export function usuarioDaRequisicao(request: FastifyRequest): UsuarioPainel {
  const usuario = usuarioPorRequisicao.get(request);
  if (!usuario) {
    throw new HttpError(401, 'Entre com seu usuário e senha para continuar');
  }
  return usuario;
}

// ---------- Usuários (aba Usuários do Administrador; vale na hora) ----------

function obterUsuario(id: string): UsuarioPainelSalvo {
  const usuario = usuariosPainel.get(id);
  if (!usuario) {
    throw new HttpError(404, 'Usuário não encontrado');
  }
  return usuario;
}

export async function listarUsuarios(agora = Date.now()): Promise<UsuarioPainel[]> {
  return [...usuariosPainel.values()]
    .map((usuario) => publico(usuario, agora))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function criarUsuario(body: CriarUsuarioBody): Promise<UsuarioPainel> {
  const login = normalizarLogin(body?.login);
  if (!LOGIN_VALIDO.test(login)) {
    throw new HttpError(
      400,
      'O usuário deve ter de 3 a 30 caracteres: letras sem acento, números, ponto, hífen ou sublinhado',
    );
  }
  const nome = texto(body?.nome, 'Nome', 60);
  const papel = body?.papel;
  if (!PAPEIS.includes(papel)) {
    throw new HttpError(400, 'Escolha o perfil: Administrador ou Funcionário');
  }
  const senha = validarSenhaNova(body?.senha);
  if (buscarPorLogin(login)) {
    throw new HttpError(409, `Já existe o usuário "${login}"`);
  }

  const senhaHash = await gerarHashSenha(senha);
  // Confere de novo: outro cadastro com o mesmo login pode ter entrado durante o hash.
  if (buscarPorLogin(login)) {
    throw new HttpError(409, `Já existe o usuário "${login}"`);
  }
  const usuario: UsuarioPainelSalvo = {
    id: randomUUID(),
    login,
    nome,
    papel,
    criadoEm: new Date().toISOString(),
    senhaHash,
  };
  usuariosPainel.set(usuario.id, usuario);
  persistir();
  return publico(usuario, Date.now());
}

// Ninguém remove o próprio usuário — o que também garante que sempre sobra pelo menos um
// Administrador (só um Administrador remove usuários).
export async function removerUsuario(id: string, quemPede: UsuarioPainel): Promise<void> {
  const usuario = obterUsuario(id);
  if (usuario.id === quemPede.id) {
    throw new HttpError(400, 'Você não pode remover o próprio usuário');
  }
  usuariosPainel.delete(id);
  encerrarSessoesDoUsuario(id);
  tentativas.delete(usuario.login);
  persistir();
}

// Troca a senha, desbloqueia o login e encerra as outras sessões do usuário (quem
// estiver logado com a senha antiga sai). Se for a própria senha, a sessão atual fica.
export async function redefinirSenha(
  id: string,
  body: RedefinirSenhaBody,
  tokenAtual: string,
): Promise<UsuarioPainel> {
  const usuario = obterUsuario(id);
  const senha = validarSenhaNova(body?.senha);
  usuario.senhaHash = await gerarHashSenha(senha);
  tentativas.delete(usuario.login);
  encerrarSessoesDoUsuario(id, tokenAtual ? chaveDoToken(tokenAtual) : undefined);
  persistir();
  return publico(usuario, Date.now());
}

export async function desbloquearUsuario(id: string): Promise<UsuarioPainel> {
  const usuario = obterUsuario(id);
  tentativas.delete(usuario.login);
  return publico(usuario, Date.now());
}

// Primeira vez que o servidor sobe (nenhum usuário salvo): cria `admin` (Administrador)
// e `funcionario` (Funcionário) com as senhas das variáveis de ambiente. Devolve os
// logins criados.
export async function criarUsuariosIniciais(senhas: {
  adminSenhaInicial: string;
  funcionarioSenhaInicial: string;
}): Promise<string[]> {
  if (usuariosPainel.size > 0) {
    return [];
  }
  await criarUsuario({
    login: 'admin',
    nome: 'Administrador',
    papel: 'administrador',
    senha: senhas.adminSenhaInicial,
  });
  await criarUsuario({
    login: 'funcionario',
    nome: 'Funcionário',
    papel: 'funcionario',
    senha: senhas.funcionarioSenhaInicial,
  });
  return ['admin', 'funcionario'];
}
