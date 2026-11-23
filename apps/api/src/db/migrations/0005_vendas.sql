-- Migration 0005: histórico de vendas para o relatório de vendas e mais vendidos (US 25).
-- Como as anteriores, ainda não é executada por nenhuma ferramenta: documenta o schema
-- alvo (ver src/db/schema.ts). Hoje o histórico fica em apps/api/data/vendas.jsonl (ver
-- src/db/persistencia.ts).

-- Uma linha por pedido pago (em dinheiro, quando o caixa confirma), só com inserções.
-- Não guarda dado pessoal: nem CPF, nem cliente, nem contato.
CREATE TABLE IF NOT EXISTS vendas (
  pedido_id UUID PRIMARY KEY REFERENCES pedidos (id),
  numero CHAR(3) NOT NULL,
  paga_em TIMESTAMPTZ NOT NULL,
  forma_pagamento TEXT NOT NULL CHECK (
    forma_pagamento IN ('credito', 'debito', 'pix', 'vale_refeicao', 'vale_alimentacao', 'dinheiro')
  ),
  consumo TEXT CHECK (consumo IN ('local', 'viagem')),
  cupom TEXT
);

CREATE INDEX IF NOT EXISTS vendas_paga_em ON vendas (paga_em);

-- Cada produto da venda, com nome e categoria como estavam na hora (o histórico não muda
-- quando o cardápio muda) e a parte dos descontos do pedido que coube à linha.
CREATE TABLE IF NOT EXISTS itens_vendidos (
  pedido_id UUID NOT NULL REFERENCES vendas (pedido_id),
  item_cardapio_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  categoria_nome TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  desconto_centavos INTEGER NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
  CHECK (desconto_centavos <= valor_centavos)
);

CREATE INDEX IF NOT EXISTS itens_vendidos_item ON itens_vendidos (item_cardapio_id);
CREATE INDEX IF NOT EXISTS itens_vendidos_categoria ON itens_vendidos (categoria);
