import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { PapelAcesso, SessaoAcesso } from '@totem/shared';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { HttpError } from '../../errors';

// Item 7: a área restrita tem dois papéis, cada um com o seu PIN (ADMIN_PIN e
// FUNCIONARIO_PIN). O PIN só é digitado na entrada: ela abre uma sessão, e as demais
// chamadas levam o token da sessão no cabeçalho `x-sessao`. É uma trava simples para
// esta fase, não um login com usuários.
// - 5 PINs errados seguidos bloqueiam novas tentativas daquele endereço por alguns
//   minutos (ACESSO_BLOQUEIO_MINUTOS, padrão 5).
// - A sessão expira depois de 30 minutos sem uso (SESSAO_INATIVA_MINUTOS). Chamadas
//   automáticas da tela (atualização periódica) mandam `x-sessao-passiva: 1` e não
//   contam como uso.

export const TENTATIVAS_ANTES_DO_BLOQUEIO = 5;

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

// ---------- Bloqueio por PINs errados ----------

interface Tentativas {
  erros: number;
  bloqueadoAte?: number;
}

const tentativasPorOrigem = new Map<string, Tentativas>();

function minutos(quantidade: number): string {
  return quantidade === 1 ? '1 minuto' : `${quantidade} minutos`;
}

function exigirOrigemLiberada(origem: string, agora: number): void {
  const registro = tentativasPorOrigem.get(origem);
  if (registro?.bloqueadoAte && registro.bloqueadoAte > agora) {
    const restante = Math.ceil((registro.bloqueadoAte - agora) / 60_000);
    throw new HttpError(
      429,
      `Acesso bloqueado por excesso de tentativas. Tente de novo em ${minutos(restante)}.`,
    );
  }
}

function registrarErro(origem: string, agora: number): HttpError {
  const registro = tentativasPorOrigem.get(origem) ?? { erros: 0 };
  // Um bloqueio que já passou recomeça a contagem.
  if (registro.bloqueadoAte && registro.bloqueadoAte <= agora) {
    registro.erros = 0;
    registro.bloqueadoAte = undefined;
  }
  registro.erros += 1;
  tentativasPorOrigem.set(origem, registro);

  if (registro.erros >= TENTATIVAS_ANTES_DO_BLOQUEIO) {
    const { bloqueioMinutos } = loadEnv();
    registro.bloqueadoAte = agora + bloqueioMinutos * 60_000;
    registro.erros = 0;
    return new HttpError(
      429,
      `PIN incorreto. Foram ${TENTATIVAS_ANTES_DO_BLOQUEIO} erros seguidos: o acesso ficou ` +
        `bloqueado por ${minutos(bloqueioMinutos)}.`,
    );
  }
  const restam = TENTATIVAS_ANTES_DO_BLOQUEIO - registro.erros;
  return new HttpError(
    401,
    `PIN incorreto. ${restam === 1 ? 'Resta 1 tentativa' : `Restam ${restam} tentativas`} ` +
      'antes do bloqueio temporário.',
  );
}

// ---------- Sessões ----------

interface Sessao {
  papel: PapelAcesso;
  ultimaAtividade: number;
}

const sessoes = new Map<string, Sessao>();

function sessaoExpirada(sessao: Sessao, agora: number): boolean {
  return agora - sessao.ultimaAtividade > loadEnv().sessaoInativaMinutos * 60_000;
}

// Confere o PIN e abre uma sessão. `origem` identifica quem tenta (endereço IP).
export function entrar(pin: unknown, origem: string, agora = Date.now()): SessaoAcesso {
  exigirOrigemLiberada(origem, agora);
  const papel = papelDoPin(pin);
  if (!papel) {
    throw registrarErro(origem, agora);
  }
  tentativasPorOrigem.delete(origem);

  // Aproveita para esquecer as sessões que já expiraram.
  for (const [token, sessao] of sessoes) {
    if (sessaoExpirada(sessao, agora)) {
      sessoes.delete(token);
    }
  }
  const token = randomBytes(32).toString('hex');
  sessoes.set(token, { papel, ultimaAtividade: agora });
  return { papel, token, minutosInatividade: loadEnv().sessaoInativaMinutos };
}

export function sair(token: unknown): void {
  if (typeof token === 'string') {
    sessoes.delete(token);
  }
}

// Papel da sessão, ou recusa (401) se ela não existe ou expirou por inatividade. Uma
// chamada `passiva` não renova o prazo.
export function papelDaSessao(token: unknown, passiva = false, agora = Date.now()): PapelAcesso {
  const sessao = typeof token === 'string' ? sessoes.get(token) : undefined;
  if (!sessao) {
    throw new HttpError(401, 'Sessão encerrada. Digite o PIN de novo.');
  }
  if (sessaoExpirada(sessao, agora)) {
    sessoes.delete(token as string);
    throw new HttpError(401, 'Sessão expirada por inatividade. Digite o PIN de novo.');
  }
  if (!passiva) {
    sessao.ultimaAtividade = agora;
  }
  return sessao.papel;
}

// Só para os testes.
export function limparAcessos(): void {
  sessoes.clear();
  tentativasPorOrigem.clear();
}

// Recusa, em todas as rotas do plugin, quem não tem uma sessão válida de um dos papéis
// aceitos.
export function exigirPapel(app: FastifyInstance, aceitos: PapelAcesso[]): void {
  app.addHook('onRequest', async (request) => {
    const papel = papelDaSessao(
      request.headers['x-sessao'],
      request.headers['x-sessao-passiva'] === '1',
    );
    if (!aceitos.includes(papel)) {
      throw new HttpError(403, 'Esta ação é do modo Administrador');
    }
  });
}

// Entrada e saída da área restrita.
export async function acessoRoutes(app: FastifyInstance): Promise<void> {
  // O PIN vai no corpo (não na URL, que cai no log do servidor).
  app.post<{ Body: { pin?: unknown } }>('/', async (request) => {
    return entrar(request.body?.pin, request.ip);
  });

  app.post('/sair', async (request, reply) => {
    sair(request.headers['x-sessao']);
    return reply.status(204).send();
  });
}
