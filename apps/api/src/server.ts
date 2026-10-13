import { buildApp } from './app';
import { ADMIN_PIN_PADRAO, loadEnv } from './config/env';

async function start(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp();

  if (env.adminPin === ADMIN_PIN_PADRAO) {
    app.log.warn(
      `Tela de administrador usando o PIN padrão (${ADMIN_PIN_PADRAO}). Defina ADMIN_PIN antes de usar o totem de verdade.`,
    );
  }

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
