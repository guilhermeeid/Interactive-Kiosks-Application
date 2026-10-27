// Carregamento e tipagem das variáveis de ambiente do backend.
// Valores default aqui são apenas para desenvolvimento local (ver infra/.env.example).

export interface Env {
  port: number;
  databaseUrl: string;
  adminPin: string;
  funcionarioPin: string;
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
  };
}
