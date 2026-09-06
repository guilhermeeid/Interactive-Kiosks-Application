-- Migration inicial: cria as tabelas do MVP (tier Básico).
-- TODO: definir a ferramenta de migração (ex.: node-pg-migrate, Drizzle Kit) que vai
-- executar este arquivo; por ora ele documenta o schema alvo (ver src/db/schema.ts).

CREATE TABLE IF NOT EXISTS itens_cardapio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL,
  preco_centavos INTEGER NOT NULL,
  imagem_url TEXT,
  disponivel BOOLEAN NOT NULL DEFAULT TRUE
);

-- LGPD: dado pessoal — exige consentimento/criptografia (numero_fidelidade)
CREATE TABLE IF NOT EXISTS clientes_fidelidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_fidelidade TEXT NOT NULL UNIQUE,
  pontos INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cupons (
  codigo TEXT PRIMARY KEY,
  tipo_desconto TEXT NOT NULL CHECK (tipo_desconto IN ('percentual', 'valor_fixo')),
  valor INTEGER NOT NULL,
  valido_ate TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

-- LGPD: dado pessoal — exige consentimento/criptografia (cpf_na_nota)
CREATE TABLE IF NOT EXISTS pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'em_montagem',
  cliente_id UUID REFERENCES clientes_fidelidade (id),
  cpf_na_nota TEXT,
  cupom_codigo TEXT REFERENCES cupons (codigo),
  valor_total_centavos INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos (id),
  item_cardapio_id UUID NOT NULL REFERENCES itens_cardapio (id),
  quantidade INTEGER NOT NULL,
  preco_unitario_centavos INTEGER NOT NULL,
  observacoes TEXT
);

-- LGPD: dado pessoal — exige consentimento/criptografia (destino: e-mail/telefone)
CREATE TABLE IF NOT EXISTS comprovantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos (id),
  canal TEXT NOT NULL CHECK (canal IN ('email', 'sms')),
  destino TEXT NOT NULL,
  nota_fiscal_url TEXT,
  enviado_em TIMESTAMPTZ
);

-- Nenhuma tabela de dados de cartão é criada: pagamento é sempre delegado ao
-- gateway/adquirente via tokenização (ver src/integrations/gateway-pagamento).
