-- Migration 0002: tela de administrador — configuração do totem, categorias, estoque,
-- limite de usos de cupom, pontos de fidelidade e número do pedido.
-- Como a 0001, ainda não é executada por nenhuma ferramenta: documenta o schema alvo
-- (ver src/db/schema.ts). Hoje esses dados ficam em apps/api/data/estado.json
-- (ver src/db/persistencia.ts).

-- Linha única com a ConfigTotem (aparência, fidelidade, formas de pagamento, cupons
-- habilitados, aba "Todos"); as categorias ficam na tabela própria abaixo.
CREATE TABLE IF NOT EXISTS configuracao_totem (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  dados JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS categorias_cardapio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  icone TEXT,
  ordem INTEGER NOT NULL
);

-- estoque NULL = sem controle de quantidade; 0 = esgotado.
ALTER TABLE itens_cardapio
  ADD COLUMN IF NOT EXISTS icone TEXT,
  ADD COLUMN IF NOT EXISTS estoque INTEGER CHECK (estoque >= 0);

-- limite_usos NULL = sem limite; usos conta só pedidos pagos.
ALTER TABLE cupons
  ADD COLUMN IF NOT EXISTS limite_usos INTEGER CHECK (limite_usos > 0),
  ADD COLUMN IF NOT EXISTS usos INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS pontos_usados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pontos_acumulados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_cupom_centavos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_pontos_centavos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_a_pagar_centavos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS numero CHAR(3),
  ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMPTZ;

-- O número de três dígitos não se repete entre pedidos pagos e ainda não entregues.
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_numero_em_aberto
  ON pedidos (numero)
  WHERE numero IS NOT NULL AND entregue_em IS NULL;
