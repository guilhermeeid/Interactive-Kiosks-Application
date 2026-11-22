-- Migration 0005: Card E — login no painel com perfis (US 35) e categorias
-- ativas/desativadas (US 33).
-- Como as anteriores, ainda não é executada por nenhuma ferramenta: documenta o schema
-- alvo (ver src/db/schema.ts). Hoje os usuários ficam em apps/api/data/estado.json
-- (ver src/db/persistencia.ts).

-- Usuários do painel. A senha nunca é gravada: só o hash bcrypt (com sal embutido).
-- O bloqueio por senhas erradas e as sessões ficam na memória do servidor.
CREATE TABLE IF NOT EXISTS usuarios_painel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login TEXT NOT NULL UNIQUE CHECK (login ~ '^[a-z0-9._-]{3,30}$'),
  nome TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('administrador', 'funcionario')),
  senha_hash TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categoria desativada some do totem (aba e itens), sem apagar os produtos dela.
-- A ordem de exibição já existe (coluna `ordem`, migration 0002).
ALTER TABLE categorias_cardapio
  ADD COLUMN IF NOT EXISTS ativa BOOLEAN NOT NULL DEFAULT TRUE;
