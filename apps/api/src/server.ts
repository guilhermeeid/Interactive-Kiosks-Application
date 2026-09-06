import { buildApp } from './app';
import { loadEnv } from './config/env';

async function start(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp();

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
