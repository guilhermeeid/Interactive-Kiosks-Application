-- Migration 0004: modos Administrador/Funcionário (mudanças pendentes até o reinício),
-- combos, imagens das categorias, regras de cupom, "para comer aqui/para levar" e
-- pagamento em dinheiro no caixa.
-- Como as anteriores, ainda não é executada por nenhuma ferramenta: documenta o schema
-- alvo (ver src/db/schema.ts). Hoje esses dados ficam em apps/api/data/estado.json e,
-- as pendências, em apps/api/data/rascunho.json (ver src/db/persistencia.ts).

-- O que o Administrador salvou e só entra em vigor quando o servidor reinicia: a
-- configuração inteira e, para produtos e cupons, os novos, as mudanças campo a campo e
-- os removidos. Linha única; some quando as pendências são aplicadas ou descartadas.
CREATE TABLE IF NOT EXISTS rascunho_admin (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  dados JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ícone em imagem (no lugar do emoji) e foto de capa da categoria aberta.
ALTER TABLE categorias_cardapio
  ADD COLUMN IF NOT EXISTS icone_imagem_url TEXT,
  ADD COLUMN IF NOT EXISTS capa_url TEXT;

-- Um combo é um item do cardápio com componentes. Não tem estoque próprio (estoque
-- NULL): esgota quando qualquer componente esgota. Combo não entra em outro combo.
CREATE TABLE IF NOT EXISTS componentes_combo (
  combo_id UUID NOT NULL REFERENCES itens_cardapio (id) ON DELETE CASCADE,
  item_cardapio_id UUID NOT NULL REFERENCES itens_cardapio (id),
  quantidade INTEGER NOT NULL CHECK (quantidade BETWEEN 1 AND 20),
  PRIMARY KEY (combo_id, item_cardapio_id),
  CHECK (combo_id <> item_cardapio_id)
);

-- Cupom só para alguns itens ou categorias (o desconto incide sobre eles), pedido
-- mínimo e teto do desconto em percentual (ex.: 10% limitado a R$ 50,00).
ALTER TABLE cupons
  ADD COLUMN IF NOT EXISTS aplica_em_tipo TEXT CHECK (aplica_em_tipo IN ('itens', 'categorias')),
  ADD COLUMN IF NOT EXISTS aplica_em_ids TEXT[],
  ADD COLUMN IF NOT EXISTS pedido_minimo_centavos INTEGER CHECK (pedido_minimo_centavos > 0),
  ADD COLUMN IF NOT EXISTS desconto_maximo_centavos INTEGER CHECK (desconto_maximo_centavos > 0),
  ADD CONSTRAINT cupons_aplica_em_completo
    CHECK ((aplica_em_tipo IS NULL) = (aplica_em_ids IS NULL)),
  ADD CONSTRAINT cupons_teto_so_percentual
    CHECK (desconto_maximo_centavos IS NULL OR tipo_desconto = 'percentual');

-- consumo: "para comer aqui" (local) ou "para levar" (viagem).
-- forma_pagamento: vale-refeição e vale-alimentação são formas próprias (tPag 11 e 10
-- na NFC-e). Em dinheiro, o pedido fica 'aguardando_pagamento' até o caixa confirmar;
-- os pontos previstos só são creditados nessa hora.
-- sem_dados_pessoais (0003) deixa de existir: pular a fidelidade não impede o CPF na
-- nota nem o comprovante, cada um com o seu consentimento.
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS consumo TEXT CHECK (consumo IN ('local', 'viagem')),
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT CHECK (
    forma_pagamento IN ('credito', 'debito', 'pix', 'vale_refeicao', 'vale_alimentacao', 'dinheiro')
  ),
  ADD COLUMN IF NOT EXISTS pontos_previstos INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT pedidos_status_valido CHECK (
    status IN ('em_montagem', 'aguardando_pagamento', 'pago', 'finalizado', 'cancelado')
  ),
  DROP COLUMN IF EXISTS sem_dados_pessoais;

-- O número de três dígitos também fica reservado enquanto o pedido espera o caixa;
-- pedido cancelado no caixa devolve o número.
DROP INDEX IF EXISTS pedidos_numero_em_aberto;
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_numero_em_aberto
  ON pedidos (numero)
  WHERE numero IS NOT NULL AND entregue_em IS NULL AND status <> 'cancelado';
