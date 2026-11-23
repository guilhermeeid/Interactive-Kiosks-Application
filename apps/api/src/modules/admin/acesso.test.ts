import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_PIN_PADRAO, FUNCIONARIO_PIN_PADRAO } from '../../config/env';
import { entrar, limparAcessos, papelDaSessao, sair } from './acesso';

const MINUTO = 60_000;

afterEach(() => limparAcessos());

describe('entrada na área restrita', () => {
  it('o PIN define o papel e abre uma sessão', () => {
    expect(entrar(ADMIN_PIN_PADRAO, 'ip-1').papel).toBe('administrador');
    const sessao = entrar(FUNCIONARIO_PIN_PADRAO, 'ip-1');
    expect(sessao).toMatchObject({ papel: 'funcionario', minutosInatividade: 30 });
    expect(papelDaSessao(sessao.token)).toBe('funcionario');
  });

  it('PIN errado avisa quantas tentativas restam', () => {
    expect(() => entrar('9999', 'ip-2')).toThrow(/Restam 4 tentativas/);
    expect(() => entrar('9999', 'ip-2')).toThrow(/Restam 3 tentativas/);
  });

  it('bloqueia temporariamente depois de 5 erros seguidos, mesmo com o PIN certo', () => {
    const agora = Date.now();
    for (let i = 0; i < 4; i++) {
      expect(() => entrar('9999', 'ip-3', agora)).toThrow();
    }
    expect(() => entrar('9999', 'ip-3', agora)).toThrowError(
      expect.objectContaining({ statusCode: 429 }),
    );
    expect(() => entrar(ADMIN_PIN_PADRAO, 'ip-3', agora + MINUTO)).toThrowError(
      expect.objectContaining({ statusCode: 429, message: expect.stringMatching(/4 minutos/) }),
    );
    // Outro endereço não é afetado; depois do prazo, o mesmo volta a entrar.
    expect(entrar(ADMIN_PIN_PADRAO, 'ip-4', agora).papel).toBe('administrador');
    expect(entrar(ADMIN_PIN_PADRAO, 'ip-3', agora + 5 * MINUTO + 1).papel).toBe('administrador');
  });

  it('um acerto zera a contagem de erros', () => {
    for (let i = 0; i < 4; i++) {
      expect(() => entrar('9999', 'ip-5')).toThrow();
    }
    entrar(ADMIN_PIN_PADRAO, 'ip-5');
    expect(() => entrar('9999', 'ip-5')).toThrow(/Restam 4 tentativas/);
  });
});

describe('sessão', () => {
  it('expira depois de 30 minutos sem uso; o uso renova o prazo', () => {
    const agora = Date.now();
    const { token } = entrar(ADMIN_PIN_PADRAO, 'ip-6', agora);

    expect(papelDaSessao(token, false, agora + 20 * MINUTO)).toBe('administrador');
    expect(papelDaSessao(token, false, agora + 45 * MINUTO)).toBe('administrador');
    expect(() => papelDaSessao(token, false, agora + 76 * MINUTO)).toThrowError(
      expect.objectContaining({ statusCode: 401, message: expect.stringMatching(/inatividade/) }),
    );
    // Expirada, não volta.
    expect(() => papelDaSessao(token, false, agora + 76 * MINUTO)).toThrow();
  });

  it('atualização automática da tela (passiva) não conta como uso', () => {
    const agora = Date.now();
    const { token } = entrar(ADMIN_PIN_PADRAO, 'ip-7', agora);
    expect(papelDaSessao(token, true, agora + 25 * MINUTO)).toBe('administrador');
    expect(() => papelDaSessao(token, true, agora + 31 * MINUTO)).toThrow(/inatividade/);
  });

  it('sair encerra a sessão; token desconhecido é recusado', () => {
    const { token } = entrar(ADMIN_PIN_PADRAO, 'ip-8');
    sair(token);
    expect(() => papelDaSessao(token)).toThrowError(expect.objectContaining({ statusCode: 401 }));
    expect(() => papelDaSessao(undefined)).toThrow();
  });
});
