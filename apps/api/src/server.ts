import { buildApp } from './app';
import { ADMIN_SENHA_PADRAO, FUNCIONARIO_SENHA_PADRAO, loadEnv } from './config/env';
import { criarUsuariosIniciais } from './modules/acesso';

async function start(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp();

  // Card E / US 35: na primeira subida, sem nenhum usuário do painel, cria os iniciais.
  const criados = await criarUsuariosIniciais(env);
  if (criados.length > 0) {
    app.log.info(`Usuários do painel criados: ${criados.join(', ')}.`);
    if (
      env.adminSenhaInicial === ADMIN_SENHA_PADRAO ||
      env.funcionarioSenhaInicial === FUNCIONARIO_SENHA_PADRAO
    ) {
      app.log.warn(
        `Usuários do painel criados com a senha padrão (admin: ${ADMIN_SENHA_PADRAO}, ` +
          `funcionario: ${FUNCIONARIO_SENHA_PADRAO}). Troque as senhas na aba Usuários ` +
          'antes de usar o totem de verdade.',
      );
    }
  }

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
