-- Migration 0006: Pix com QR Code dinâmico, NFC-e na tela, consulta de pedidos e
-- organização das categorias ao vivo.
-- Como as anteriores, ainda não é executada por nenhuma ferramenta: documenta o schema
-- alvo (ver src/db/schema.ts). Hoje tudo fica em apps/api/data/estado.json (ver
-- src/db/persistencia.ts).

-- Pix na tela: estoque, cupom, pontos e número ficam reservados até o banco confirmar
-- ou o QR expirar.
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_status_valido;
ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_status_valido CHECK (
    status IN (
      'em_montagem', 'aguardando_pagamento', 'aguardando_pix', 'pago', 'finalizado', 'cancelado'
    )
  );

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS pago_em TIMESTAMPTZ,
  -- Transação que efetivamente pagou o pedido (no Pix, o QR que o cliente pagou).
  ADD COLUMN IF NOT EXISTS transacao_id TEXT,
  -- Pix confirmado pelo banco depois de o QR expirar no totem, conciliado sem nova cobrança.
  ADD COLUMN IF NOT EXISTS conciliado_com_atraso BOOLEAN NOT NULL DEFAULT FALSE,
  -- Cobranças Pix criadas para o pedido; compõe a chave de idempotência da próxima.
  ADD COLUMN IF NOT EXISTS pix_sequencia INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS pedidos_pago_em ON pedidos (pago_em);

-- Toda cobrança Pix de um pedido (a atual e as que expiraram), para conciliar uma
-- confirmação atrasada e estornar um pagamento em duplicidade.
CREATE TABLE IF NOT EXISTS cobrancas_pix (
  transacao_id TEXT PRIMARY KEY,
  pedido_id UUID NOT NULL REFERENCES pedidos (id),
  copia_e_cola TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  criada_em TIMESTAMPTZ NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendente', 'paga', 'expirada', 'cancelada'))
);

CREATE INDEX IF NOT EXISTS cobrancas_pix_pedido ON cobrancas_pix (pedido_id);

-- NFC-e: emitida na aprovação do pagamento. Uma por pedido; a falha fica registrada e a
-- emissão pode ser refeita pelo balcão.
CREATE TABLE IF NOT EXISTS notas_fiscais (
  pedido_id UUID PRIMARY KEY REFERENCES pedidos (id),
  status TEXT NOT NULL CHECK (status IN ('autorizada', 'falha')),
  numero TEXT,
  serie TEXT,
  chave_acesso CHAR(44),
  url_consulta TEXT, -- conteúdo do QR Code de consulta
  url_danfe TEXT,
  erro TEXT,
  tentativas INTEGER NOT NULL DEFAULT 1 CHECK (tentativas > 0),
  ultima_tentativa_em TIMESTAMPTZ NOT NULL,
  autorizada_em TIMESTAMPTZ,
  CHECK (status <> 'autorizada' OR chave_acesso IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS notas_fiscais_status ON notas_fiscais (status);

-- Categoria desativada: some dos totens com os itens dela, sem apagar nada.
ALTER TABLE categorias_cardapio
  ADD COLUMN IF NOT EXISTS ativa BOOLEAN NOT NULL DEFAULT TRUE;

-- Reenvio do comprovante para um contato novo, autorizado pelo cliente no balcão.
ALTER TABLE registros_consentimento
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'totem'
    CHECK (origem IN ('totem', 'balcao'));
