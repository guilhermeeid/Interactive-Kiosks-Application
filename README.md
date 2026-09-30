# Totem de Autoatendimento

Plataforma de totem de autoatendimento multimodal para varejo/alimentação: o cliente navega no cardápio, monta o pedido, paga e recebe o comprovante sozinho.

O produto é **modular por camadas (tiers)**, com um princípio inegociável: **nenhum módulo de hardware é acoplado ao núcleo do sistema**. Isso é refletido na estrutura de código — ver [Separação por tiers](#separação-por-tiers) abaixo.

## Stack

- **Monorepo:** npm workspaces.
- **Frontend** ([apps/totem](apps/totem)): React 18 + TypeScript + Vite, para tela touch em modo kiosk.
- **Backend** ([apps/api](apps/api)): Node.js + TypeScript + Fastify.
- **Banco de dados:** PostgreSQL via Docker Compose.
- **Tipos compartilhados:** [packages/shared](packages/shared), consumido por frontend e backend.
- **Testes:** Vitest (frontend e backend).
- **Lint/format:** ESLint + Prettier, configurados na raiz.

> O MVP roda de ponta a ponta (cardápio → carrinho → identificação → pagamento/cupom → comprovante), ainda que de forma primitiva — ver [Estado atual do MVP](#estado-atual-do-mvp-o-que-é-real-e-o-que-é-mock) para o que já é lógica real e o que ainda é mock/placeholder.

## Como subir o ambiente local

### 1. Pré-requisitos

- Node.js 20+
- Docker e Docker Compose

### 2. Variáveis de ambiente

Copie o arquivo de exemplo e **defina sua própria `POSTGRES_PASSWORD`**:

```bash
cp infra/.env.example infra/.env
```

`POSTGRES_PASSWORD` não tem valor-padrão no `docker-compose.yml` — o `docker-compose up` falha com um erro claro se ela não estiver definida em `infra/.env`. Nunca reutilize o valor de exemplo nem commite o arquivo `.env` real (ele já está no `.gitignore`).

Variáveis disponíveis:

| Variável | Usado por | Descrição |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | `infra/docker-compose.yml` | Credenciais e porta do Postgres local |
| `DATABASE_URL` | `apps/api` | String de conexão do backend com o Postgres |
| `API_PORT` | `apps/api` | Porta HTTP do backend Fastify (padrão `3333`) |
| `VITE_API_URL` | `apps/totem` | URL base da API consumida pelo frontend |

### 3. Banco de dados (Postgres via Docker Compose)

```bash
cd infra
docker-compose --env-file .env up -d
```

A migration inicial (estrutura das tabelas) está em [apps/api/src/db/migrations/0001_init.sql](apps/api/src/db/migrations/0001_init.sql).

> **Este passo ainda não é necessário para rodar o MVP.** O backend hoje usa um
> armazenamento em memória ([apps/api/src/db/memory-store.ts](apps/api/src/db/memory-store.ts))
> como substituto temporário do Postgres — o schema/migration acima é o alvo real,
> ainda não conectado. Ver [Estado atual do MVP](#estado-atual-do-mvp-o-que-é-real-e-o-que-é-mock).

### 4. Instalar dependências

Na raiz do monorepo:

```bash
npm install
```

### 5. Rodar frontend e backend

```bash
npm run dev:api    # apps/api  -> http://localhost:3333
npm run dev:totem  # apps/totem -> http://localhost:5173
```

### Outros scripts úteis (raiz)

```bash
npm run lint          # ESLint em todo o monorepo
npm run format        # Prettier (write)
npm run typecheck     # tsc --noEmit em todos os workspaces
npm test              # Vitest em todos os workspaces
```

## Estado atual do MVP (o que é real e o que é mock)

O fluxo completo funciona de ponta a ponta — testado manualmente via API e navegando no totem em um navegador. O que isso significa na prática:

| Camada | O que é real | O que é primitivo/mock |
|---|---|---|
| Cardápio, carrinho, cupom, identificação | Lógica de negócio real (cálculo de subtotal, desconto, validação de CPF por formato, cadastro simplificado de fidelidade) | Dados guardados em memória ([memory-store.ts](apps/api/src/db/memory-store.ts)) — **reiniciar a API apaga todos os pedidos**. Cardápio e cupons são uma lista fixa no código, não vêm do Postgres ainda |
| Pagamento | Calcula o valor certo (com desconto, se houver) e muda o status do pedido | O gateway ([MockPagamentoGateway](apps/api/src/integrations/gateway-pagamento/mock-gateway.ts)) aprova qualquer pagamento instantaneamente — não existe adquirente real |
| Comprovante | Orquestra emissão fiscal + notificação e marca o pedido como finalizado | A nota fiscal é um número/URL fictícios ([MockEmissorFiscal](apps/api/src/integrations/api-fiscal/mock-emissor-fiscal.ts)); o e-mail/SMS só é logado no console do backend ([MockServicoNotificacao](apps/api/src/integrations/notificacao/mock-notificacao.ts)) |
| Frontend | Telas funcionais (adicionar/remover item, teclado numérico para CPF/fidelidade/telefone, aplicar cupom, escolher forma de pagamento) | Sem estilo visual definitivo — é HTML simples o suficiente para navegar e testar |

Cupons de teste já cadastrados: `BEMVINDO10` (10% de desconto) e `DESC5` (R$ 5,00 de desconto fixo).

O caminho para produção é trocar cada mock por uma implementação real **sem alterar os módulos de negócio**: ligar `memory-store.ts` ao Postgres (schema já existe), e trocar as classes `Mock*` de cada pasta em `integrations/` por adapters reais — essa é exatamente a fronteira que a arquitetura foi desenhada para isolar (ver seção abaixo).

## Separação por tiers

| Tier | Status | Recursos |
|---|---|---|
| **Básico (MVP)** | Em construção neste repositório | Cardápio digital, carrinho, fidelidade (opcional), CPF na nota, formas de pagamento, cupom de desconto, comprovante por e-mail/SMS |
| **Intermediário** | Futuro — não implementado | Impressora térmica, leitor de QR/código de barras |
| **Avançado** | Futuro — não implementado | Balança, identificação por RFID |

Toda integração externa (gateway de pagamento, emissor fiscal, notificação e, futuramente, hardware) vive em [apps/api/src/integrations/](apps/api/src/integrations/) como um **adapter**: uma interface TypeScript + uma implementação mock/stub. Os módulos de negócio em [apps/api/src/modules/](apps/api/src/modules/) dependem apenas da interface, nunca da implementação concreta — isso permite trocar de provedor, ou adicionar tiers futuros (ex.: `integrations/impressora/`, `integrations/rfid/`), sem tocar em `modules/`.

Por regra de segurança e conformidade, **nenhum dado de cartão é modelado ou armazenado** em nenhuma camada — o pagamento é sempre delegado ao gateway/adquirente via tokenização (ver [PagamentoGateway](apps/api/src/integrations/gateway-pagamento/PagamentoGateway.ts)).

Pontos de atenção LGPD (CPF, e-mail, telefone, número de fidelidade) estão sinalizados com o comentário `// LGPD: dado pessoal — exige consentimento/criptografia` em todos os arquivos que manipulam esses dados.

## Mapa de módulos/telas por história

| Épico | História | Tela ([apps/totem](apps/totem/src/screens)) | Módulo da API ([apps/api](apps/api/src/modules)) |
|---|---|---|---|
| 1. Cardápio Digital e Carrinho | US-01 Visualizar cardápio | [Cardapio](apps/totem/src/screens/Cardapio) | [cardapio](apps/api/src/modules/cardapio) |
| 1. Cardápio Digital e Carrinho | US-02 Adicionar ao carrinho | [Carrinho](apps/totem/src/screens/Carrinho) | [carrinho](apps/api/src/modules/carrinho) |
| 1. Cardápio Digital e Carrinho | US-03 Revisar/editar carrinho | [Carrinho](apps/totem/src/screens/Carrinho) | [carrinho](apps/api/src/modules/carrinho) |
| 2. Identificação do Cliente | US-04 Informar fidelidade | [Identificacao](apps/totem/src/screens/Identificacao) | [identificacao](apps/api/src/modules/identificacao) |
| 2. Identificação do Cliente | US-05 Informar CPF na nota | [Identificacao](apps/totem/src/screens/Identificacao) | [identificacao](apps/api/src/modules/identificacao) |
| 3. Pagamento e Cupons | US-06 Escolher forma de pagamento | [Pagamento](apps/totem/src/screens/Pagamento) | [pagamento](apps/api/src/modules/pagamento) (via [gateway-pagamento](apps/api/src/integrations/gateway-pagamento)) |
| 3. Pagamento e Cupons | US-07 Aplicar cupom | [Pagamento](apps/totem/src/screens/Pagamento) | [cupom](apps/api/src/modules/cupom) |
| 4. Emissão de Comprovante | US-08 Receber comprovante por e-mail/SMS | [Comprovante](apps/totem/src/screens/Comprovante) | [comprovante](apps/api/src/modules/comprovante) (via [api-fiscal](apps/api/src/integrations/api-fiscal) e [notificacao](apps/api/src/integrations/notificacao)) |

## Estrutura do monorepo

```
apps/
  totem/    # Frontend touch (React + TS + Vite)
  api/      # Backend (Node + TS + Fastify)
packages/
  shared/   # Tipos TS compartilhados
infra/
  docker-compose.yml  # Postgres local
  .env.example
```
