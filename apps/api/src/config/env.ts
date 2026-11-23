import type { ConfigSmtp } from '../integrations/notificacao/smtp-notificacao';

// Carregamento e tipagem das variáveis de ambiente do backend.
// Valores default aqui são apenas para desenvolvimento local (ver infra/.env.example).

export interface Env {
  port: number;
  databaseUrl: string;
  adminPin: string;
  funcionarioPin: string;
  // Área restrita: bloqueio depois de 5 PINs errados e expiração da sessão sem uso.
  bloqueioMinutos: number;
  sessaoInativaMinutos: number;
  // Pix: validade do QR Code, tempo máximo de espera pelo banco e token do webhook.
  pixExpiracaoSegundos: number;
  pixTempoLimiteMs: number;
  pixWebhookToken: string;
  // Tempo máximo de espera pela autorização da NFC-e.
  fiscalTempoLimiteMs: number;
  // E-mail do comprovante por SMTP; sem SMTP_HOST, o envio é simulado.
  smtp?: ConfigSmtp;
  notificacaoTempoLimiteMs: number;
}

function lerSmtp(): ConfigSmtp | undefined {
  const host = process.env.SMTP_HOST?.trim();
  // Sem a senha (ex.: senha de app do Gmail ainda não colada), o envio real só falharia:
  // continua simulado até ela ser preenchida.
  if (!host || (process.env.SMTP_USUARIO && !process.env.SMTP_SENHA?.trim())) return undefined;
  const porta = numeroPositivo(process.env.SMTP_PORTA, 587);
  return {
    host,
    porta,
    // Porta 465 usa TLS direto; as demais, STARTTLS.
    seguro: process.env.SMTP_SEGURO ? process.env.SMTP_SEGURO === 'true' : porta === 465,
    usuario: process.env.SMTP_USUARIO || undefined,
    senha: process.env.SMTP_SENHA || undefined,
    remetente: process.env.SMTP_REMETENTE || process.env.SMTP_USUARIO || `comprovantes@${host}`,
  };
}

// Token do webhook do Pix quando PIX_WEBHOOK_TOKEN não é definido. Só para
// desenvolvimento: o provedor real precisa de um segredo próprio.
export const PIX_WEBHOOK_TOKEN_PADRAO = 'dev-webhook-pix';

function numeroPositivo(valor: string | undefined, padrao: number): number {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : padrao;
}

// PINs da área restrita (/admin) quando ADMIN_PIN e FUNCIONARIO_PIN não são definidos.
// Só servem para desenvolvimento: em uso real, defina PINs próprios.
export const ADMIN_PIN_PADRAO = '1234';
export const FUNCIONARIO_PIN_PADRAO = '0000';

// TODO: validar as variáveis de ambiente obrigatórias na inicialização (ex.: com uma
// lib de schema) e falhar rápido caso alguma esteja ausente em produção.
export function loadEnv(): Env {
  return {
    port: Number(process.env.API_PORT ?? 3333),
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgresql://totem:totem@localhost:5432/totem_autoatendimento',
    adminPin: process.env.ADMIN_PIN || ADMIN_PIN_PADRAO,
    funcionarioPin: process.env.FUNCIONARIO_PIN || FUNCIONARIO_PIN_PADRAO,
    bloqueioMinutos: numeroPositivo(process.env.ACESSO_BLOQUEIO_MINUTOS, 5),
    sessaoInativaMinutos: numeroPositivo(process.env.SESSAO_INATIVA_MINUTOS, 30),
    pixExpiracaoSegundos: numeroPositivo(process.env.PIX_EXPIRACAO_SEGUNDOS, 300),
    pixTempoLimiteMs: numeroPositivo(process.env.PIX_TEMPO_LIMITE_MS, 10_000),
    pixWebhookToken: process.env.PIX_WEBHOOK_TOKEN || PIX_WEBHOOK_TOKEN_PADRAO,
    fiscalTempoLimiteMs: numeroPositivo(process.env.FISCAL_TEMPO_LIMITE_MS, 15_000),
    smtp: lerSmtp(),
    notificacaoTempoLimiteMs: numeroPositivo(process.env.NOTIFICACAO_TEMPO_LIMITE_MS, 20_000),
  };
}
