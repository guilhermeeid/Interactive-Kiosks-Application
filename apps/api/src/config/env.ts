// Carregamento e tipagem das variáveis de ambiente do backend.
// Valores default aqui são apenas para desenvolvimento local (ver infra/.env.example).

export interface Env {
  port: number;
  databaseUrl: string;
  adminSenhaInicial: string;
  funcionarioSenhaInicial: string;
}

// Card E / US 35: senhas dos usuários que o servidor cria na primeira vez que sobe, sem
// nenhum usuário do painel cadastrado (logins `admin` e `funcionario`). Depois disso as
// variáveis não têm mais efeito: senhas e usuários são geridos na aba Usuários.
// Os valores-padrão só servem para desenvolvimento.
export const ADMIN_SENHA_PADRAO = 'admin1234';
export const FUNCIONARIO_SENHA_PADRAO = 'func1234';

// TODO: validar as variáveis de ambiente obrigatórias na inicialização (ex.: com uma
// lib de schema) e falhar rápido caso alguma esteja ausente em produção.
export function loadEnv(): Env {
  return {
    port: Number(process.env.API_PORT ?? 3333),
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgresql://totem:totem@localhost:5432/totem_autoatendimento',
    adminSenhaInicial: process.env.ADMIN_SENHA_INICIAL || ADMIN_SENHA_PADRAO,
    funcionarioSenhaInicial: process.env.FUNCIONARIO_SENHA_INICIAL || FUNCIONARIO_SENHA_PADRAO,
  };
}
