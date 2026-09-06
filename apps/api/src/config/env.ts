// Carregamento e tipagem das variáveis de ambiente do backend.
// Valores default aqui são apenas para desenvolvimento local (ver infra/.env.example).

export interface Env {
  port: number;
  databaseUrl: string;
}

// TODO: validar as variáveis de ambiente obrigatórias na inicialização (ex.: com uma
// lib de schema) e falhar rápido caso alguma esteja ausente em produção.
export function loadEnv(): Env {
  return {
    port: Number(process.env.API_PORT ?? 3333),
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgresql://totem:totem@localhost:5432/totem_autoatendimento',
  };
}
