import type { PapelAcesso, UsuarioPainel } from '@totem/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { usuariosPainel } from '../../db/memory-store';
import {
  autenticar,
  BLOQUEIO_MINUTOS,
  criarUsuario,
  criarUsuariosIniciais,
  desbloquearUsuario,
  entrar,
  INATIVIDADE_MAXIMA_MINUTOS,
  listarUsuarios,
  redefinirSenha,
  removerUsuario,
  sair,
} from './acesso.service';

const MINUTO = 60_000;
const SENHA = 'senha-certa';

let contador = 0;
async function novoUsuario(
  papel: PapelAcesso = 'funcionario',
): Promise<{ login: string; usuario: UsuarioPainel }> {
  contador += 1;
  const login = `teste${contador}`;
  const usuario = await criarUsuario({ login, nome: `Teste ${contador}`, papel, senha: SENHA });
  return { login, usuario };
}

// Card E / US 35
describe('usuários iniciais', () => {
  it('na primeira subida cria admin e funcionario; depois não cria mais nada', async () => {
    expect(usuariosPainel.size).toBe(0);
    const criados = await criarUsuariosIniciais({
      adminSenhaInicial: 'senha-do-admin',
      funcionarioSenhaInicial: 'senha-do-func',
    });
    expect(criados).toEqual(['admin', 'funcionario']);
    expect((await entrar({ login: 'admin', senha: 'senha-do-admin' })).usuario.papel).toBe(
      'administrador',
    );
    expect((await entrar({ login: 'funcionario', senha: 'senha-do-func' })).usuario.papel).toBe(
      'funcionario',
    );

    expect(
      await criarUsuariosIniciais({
        adminSenhaInicial: 'outra-1234',
        funcionarioSenhaInicial: 'x',
      }),
    ).toEqual([]);
  });

  it('a senha nunca é guardada nem devolvida, só o hash bcrypt', async () => {
    const { usuario } = await novoUsuario();
    expect(usuario).not.toHaveProperty('senhaHash');
    const salvo = usuariosPainel.get(usuario.id)!;
    expect(salvo.senhaHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(salvo)).not.toContain(SENHA);
  });
});

describe('entrar', () => {
  it('usuário e senha certos abrem a sessão; o login ignora maiúsculas e espaços', async () => {
    const { login } = await novoUsuario();
    const sessao = await entrar({ login: `  ${login.toUpperCase()} `, senha: SENHA });
    expect(sessao.token.length).toBeGreaterThan(30);
    expect(sessao.usuario.login).toBe(login);
    expect(sessao.inatividadeMaximaMinutos).toBe(INATIVIDADE_MAXIMA_MINUTOS);
  });

  it('senha errada e usuário inexistente recebem a mesma resposta', async () => {
    const { login } = await novoUsuario();
    await expect(entrar({ login, senha: 'errada' })).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringMatching(/Usuário ou senha incorretos\. Restam 4 tentativas/),
    });
    await expect(entrar({ login: 'nao-existe', senha: 'errada' })).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringMatching(/Usuário ou senha incorretos\. Restam 4 tentativas/),
    });
    await expect(entrar({ login: '', senha: '' })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('bloqueio após 5 senhas erradas seguidas', () => {
  it('a quinta bloqueia por 15 minutos, inclusive para a senha certa', async () => {
    const { login, usuario } = await novoUsuario();
    const t0 = Date.now();
    for (let i = 1; i <= 4; i++) {
      await expect(entrar({ login, senha: 'errada' }, t0)).rejects.toMatchObject({
        statusCode: 401,
      });
    }
    await expect(entrar({ login, senha: 'errada' }, t0)).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringMatching(/5 vezes seguidas.*15 minutos/),
    });
    await expect(entrar({ login, senha: SENHA }, t0 + 5 * MINUTO)).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringMatching(/Tente de novo em 10 minutos/),
    });
    const naLista = (await listarUsuarios(t0)).find((u) => u.id === usuario.id);
    expect(naLista?.bloqueadoAte).toBe(new Date(t0 + BLOQUEIO_MINUTOS * MINUTO).toISOString());

    const depois = t0 + BLOQUEIO_MINUTOS * MINUTO + 1;
    expect((await entrar({ login, senha: SENHA }, depois)).usuario.id).toBe(usuario.id);
  });

  it('acertar a senha zera a contagem', async () => {
    const { login } = await novoUsuario();
    for (let i = 1; i <= 4; i++) {
      await expect(entrar({ login, senha: 'errada' })).rejects.toMatchObject({ statusCode: 401 });
    }
    await entrar({ login, senha: SENHA });
    await expect(entrar({ login, senha: 'errada' })).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringMatching(/Restam 4/),
    });
  });

  it('o Administrador pode desbloquear antes do prazo', async () => {
    const { login, usuario } = await novoUsuario();
    for (let i = 1; i <= 5; i++) {
      await entrar({ login, senha: 'errada' }).catch(() => undefined);
    }
    await expect(entrar({ login, senha: SENHA })).rejects.toMatchObject({ statusCode: 429 });
    expect((await desbloquearUsuario(usuario.id)).bloqueadoAte).toBeUndefined();
    expect((await entrar({ login, senha: SENHA })).usuario.id).toBe(usuario.id);
  });
});

describe('sessão', () => {
  it('expira depois de 30 minutos sem uso; cada uso reinicia a contagem', async () => {
    const { login } = await novoUsuario();
    const t0 = Date.now();
    const { token } = await entrar({ login, senha: SENHA }, t0);

    expect(autenticar(token, true, t0 + 29 * MINUTO).login).toBe(login);
    expect(autenticar(token, true, t0 + 58 * MINUTO).login).toBe(login);
    expect(() => autenticar(token, true, t0 + 89 * MINUTO)).toThrow(/inatividade/);
    // Expirada, não volta.
    expect(() => autenticar(token, true, t0 + 60 * MINUTO)).toThrow(/Entre com seu usuário/);
  });

  it('chamadas automáticas da tela não contam como atividade', async () => {
    const { login } = await novoUsuario();
    const t0 = Date.now();
    const { token } = await entrar({ login, senha: SENHA }, t0);
    autenticar(token, false, t0 + 20 * MINUTO);
    expect(() => autenticar(token, false, t0 + 31 * MINUTO)).toThrow(/inatividade/);
  });

  it('sair encerra a sessão; token inventado não entra', async () => {
    const { login } = await novoUsuario();
    const { token } = await entrar({ login, senha: SENHA });
    sair(token);
    expect(() => autenticar(token, true)).toThrow(/Entre com seu usuário/);
    expect(() => autenticar('inventado', true)).toThrow(/Entre com seu usuário/);
    expect(() => autenticar('', true)).toThrow(/Entre com seu usuário/);
  });
});

describe('gestão de usuários', () => {
  it('valida login, nome, perfil e senha, e recusa login repetido', async () => {
    const base = {
      login: 'maria.silva',
      nome: 'Maria',
      papel: 'funcionario' as const,
      senha: SENHA,
    };
    await expect(criarUsuario({ ...base, login: 'ab' })).rejects.toThrow(/3 a 30/);
    await expect(criarUsuario({ ...base, login: 'joão' })).rejects.toThrow(/3 a 30/);
    await expect(criarUsuario({ ...base, nome: ' ' })).rejects.toThrow(/"Nome"/);
    await expect(
      criarUsuario({ ...base, papel: 'gerente' as unknown as PapelAcesso }),
    ).rejects.toThrow(/perfil/);
    await expect(criarUsuario({ ...base, senha: '1234567' })).rejects.toThrow(/8 caracteres/);
    await expect(criarUsuario({ ...base, senha: 'x'.repeat(73) })).rejects.toThrow(/72/);

    await criarUsuario(base);
    await expect(criarUsuario({ ...base, login: 'MARIA.SILVA' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('remover encerra as sessões do usuário; ninguém remove a si mesmo', async () => {
    const admin = await novoUsuario('administrador');
    const outro = await novoUsuario();
    const { token } = await entrar({ login: outro.login, senha: SENHA });

    await expect(removerUsuario(admin.usuario.id, admin.usuario)).rejects.toThrow(/próprio/);
    await removerUsuario(outro.usuario.id, admin.usuario);
    expect(() => autenticar(token, true)).toThrow(/Entre com seu usuário/);
    await expect(removerUsuario(outro.usuario.id, admin.usuario)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('redefinir a senha troca a senha e derruba as sessões abertas com a antiga', async () => {
    const admin = await novoUsuario('administrador');
    const outro = await novoUsuario();
    const sessaoAdmin = await entrar({ login: admin.login, senha: SENHA });
    const sessaoOutro = await entrar({ login: outro.login, senha: SENHA });

    await redefinirSenha(outro.usuario.id, { senha: 'senha-nova-1' }, sessaoAdmin.token);
    expect(() => autenticar(sessaoOutro.token, true)).toThrow(/Entre com seu usuário/);
    await expect(entrar({ login: outro.login, senha: SENHA })).rejects.toMatchObject({
      statusCode: 401,
    });
    expect((await entrar({ login: outro.login, senha: 'senha-nova-1' })).usuario.id).toBe(
      outro.usuario.id,
    );

    // A própria senha: a sessão atual continua.
    await redefinirSenha(admin.usuario.id, { senha: 'senha-nova-2' }, sessaoAdmin.token);
    expect(autenticar(sessaoAdmin.token, true).id).toBe(admin.usuario.id);
  });
});

describe('permissões por perfil nas rotas', () => {
  let app: FastifyInstance;
  let tokenAdmin: string;
  let tokenFuncionario: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    const admin = await novoUsuario('administrador');
    const funcionario = await novoUsuario('funcionario');
    const entrarPelaRota = async (login: string) => {
      const resposta = await app.inject({
        method: 'POST',
        url: '/acesso/entrar',
        payload: { login, senha: SENHA },
      });
      expect(resposta.statusCode).toBe(200);
      return resposta.json().token as string;
    };
    tokenAdmin = await entrarPelaRota(admin.login);
    tokenFuncionario = await entrarPelaRota(funcionario.login);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const chamar = (url: string, token?: string, cabecalhos: Record<string, string> = {}) =>
    app.inject({
      method: 'GET',
      url,
      headers: { ...cabecalhos, ...(token && { authorization: `Bearer ${token}` }) },
    });

  it('sem login, nada da área restrita responde', async () => {
    for (const url of ['/admin/config', '/admin/usuarios', '/funcionario/pedidos']) {
      expect((await chamar(url)).statusCode).toBe(401);
    }
    expect((await chamar('/admin/config', 'token-inventado')).statusCode).toBe(401);
  });

  it('Funcionário só acessa a área do Funcionário', async () => {
    expect((await chamar('/funcionario/pedidos', tokenFuncionario)).statusCode).toBe(200);
    expect((await chamar('/admin/config', tokenFuncionario)).statusCode).toBe(403);
    expect((await chamar('/admin/usuarios', tokenFuncionario)).statusCode).toBe(403);
  });

  it('Administrador acessa as duas áreas e a lista de usuários, sem hash de senha', async () => {
    expect((await chamar('/admin/config', tokenAdmin)).statusCode).toBe(200);
    expect((await chamar('/funcionario/pedidos', tokenAdmin)).statusCode).toBe(200);
    const usuarios = await chamar('/admin/usuarios', tokenAdmin);
    expect(usuarios.statusCode).toBe(200);
    expect(usuarios.body).not.toContain('senhaHash');
  });

  it('atualização automática (x-atividade) não mantém a sessão viva', async () => {
    const { login } = await novoUsuario('funcionario');
    const entrada = await app.inject({
      method: 'POST',
      url: '/acesso/entrar',
      payload: { login, senha: SENHA },
    });
    const { token } = entrada.json();
    const t0 = Date.now();
    const automatica = { 'x-atividade': 'automatica' };

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 20 * MINUTO);
    expect((await chamar('/funcionario/pedidos', token, automatica)).statusCode).toBe(200);
    vi.spyOn(Date, 'now').mockReturnValue(t0 + 31 * MINUTO);
    const expirada = await chamar('/funcionario/pedidos', token, automatica);
    expect(expirada.statusCode).toBe(401);
    expect(expirada.json().message).toMatch(/inatividade/);
  });

  it('sair pela rota encerra a sessão', async () => {
    const { login } = await novoUsuario('funcionario');
    const { token } = (
      await app.inject({ method: 'POST', url: '/acesso/entrar', payload: { login, senha: SENHA } })
    ).json();
    expect((await chamar('/acesso/sessao', token)).json().login).toBe(login);
    await app.inject({
      method: 'POST',
      url: '/acesso/sair',
      headers: { authorization: `Bearer ${token}` },
    });
    expect((await chamar('/acesso/sessao', token)).statusCode).toBe(401);
  });
});
