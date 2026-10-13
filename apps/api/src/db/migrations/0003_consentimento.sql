-- Migration 0003: consentimento LGPD (US 29) e pedido sem dados pessoais (US 10).
-- Como as anteriores, ainda não é executada por nenhuma ferramenta: documenta o schema
-- alvo (ver src/db/schema.ts). Hoje a auditoria fica em
-- apps/api/data/auditoria-consentimento.jsonl (ver src/db/persistencia.ts).

-- Trilha de auditoria: uma linha por decisão do cliente, só com inserções. Guarda quando
-- (data e hora), diante de qual versão do termo e para qual finalidade — nunca o dado
-- pessoal em si.
CREATE TABLE IF NOT EXISTS registros_consentimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos (id),
  finalidade TEXT NOT NULL CHECK (finalidade IN ('cpf_nota', 'fidelidade', 'comprovante')),
  aceito BOOLEAN NOT NULL,
  versao_termo TEXT NOT NULL,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registros_consentimento_pedido
  ON registros_consentimento (pedido_id);

-- A decisão vigente por finalidade sai do registro mais recente de cada (pedido,
-- finalidade). sem_dados_pessoais marca o pedido em que o cliente pulou a identificação:
-- nenhum dado pessoal é pedido nem aceito de novo nele.
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS sem_dados_pessoais BOOLEAN NOT NULL DEFAULT FALSE;
