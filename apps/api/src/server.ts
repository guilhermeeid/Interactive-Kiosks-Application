import { buildApp } from './app';
import { ADMIN_PIN_PADRAO, FUNCIONARIO_PIN_PADRAO, loadEnv } from './config/env';

async function start(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp();

  if (env.adminPin === ADMIN_PIN_PADRAO || env.funcionarioPin === FUNCIONARIO_PIN_PADRAO) {
    app.log.warn(
      `Área restrita usando PIN padrão (Administrador ${ADMIN_PIN_PADRAO}, Funcionário ` +
        `${FUNCIONARIO_PIN_PADRAO}). Defina ADMIN_PIN e FUNCIONARIO_PIN antes de usar o totem de verdade.`,
    );
  }
  if (env.adminPin === env.funcionarioPin) {
    app.log.warn('ADMIN_PIN e FUNCIONARIO_PIN são iguais: todo acesso entrará como Administrador.');
  }

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
