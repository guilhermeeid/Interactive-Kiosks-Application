// Primeiro: as variáveis de infra/.env precisam existir antes de os módulos carregarem.
import { arquivosEnvCarregados } from './config/carregar-env';
import { buildApp } from './app';
import {
  ADMIN_PIN_PADRAO,
  FUNCIONARIO_PIN_PADRAO,
  PIX_WEBHOOK_TOKEN_PADRAO,
  loadEnv,
} from './config/env';

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

  app.log.info(
    arquivosEnvCarregados.length
      ? `Variáveis carregadas de: ${arquivosEnvCarregados.join(', ')}`
      : 'Nenhum arquivo .env encontrado (infra/.env): usando só as variáveis do terminal.',
  );
  app.log.info(
    env.smtp
      ? `Comprovante por e-mail: SMTP ${env.smtp.host}:${env.smtp.porta}. SMS: simulado.`
      : process.env.SMTP_HOST && !process.env.SMTP_SENHA?.trim()
        ? 'Comprovante por e-mail: simulado — falta a SMTP_SENHA em infra/.env (senha de app do Gmail).'
        : 'Comprovante por e-mail e SMS: simulados (defina SMTP_HOST para enviar e-mails de verdade).',
  );
  if (env.pixWebhookToken === PIX_WEBHOOK_TOKEN_PADRAO) {
    app.log.warn('Webhook do Pix usando o token padrão. Defina PIX_WEBHOOK_TOKEN em uso real.');
  }

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
