// Carregamento e tipagem das variáveis de ambiente do backend.
// Valores default aqui são apenas para desenvolvimento local (ver infra/.env.example).

export interface Env {
  port: number;
  databaseUrl: string;
  adminPin: string;
}

// PIN da tela de administrador quando ADMIN_PIN não é definido. Só serve para
// desenvolvimento: em uso real, defina um PIN próprio.
export const ADMIN_PIN_PADRAO = '1234';

// TODO: validar as variáveis de ambiente obrigatórias na inicialização (ex.: com uma
// lib de schema) e falhar rápido caso alguma esteja ausente em produção.
export function loadEnv(): Env {
  return {
    port: Number(process.env.API_PORT ?? 3333),
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgresql://totem:totem@localhost:5432/totem_autoatendimento',
    adminPin: process.env.ADMIN_PIN || ADMIN_PIN_PADRAO,
  };
}
