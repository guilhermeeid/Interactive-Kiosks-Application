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
| `ADMIN_PIN` | `apps/api` | PIN da [tela de administrador](#tela-de-administrador) (padrão `1234`, só para desenvolvimento) |
| `DATA_DIR` | `apps/api` | Pasta onde a API grava a configuração do administrador e as imagens (padrão `apps/api/data`) |
| `VITE_API_URL` | `apps/totem` | URL base da API consumida pelo frontend (padrão: porta `3333` da máquina que serviu a página) |

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
npm run dev:totem  # apps/totem -> http://localhost:5173 (cliente) e /admin (administrador)
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
| Cardápio, carrinho, cupom, identificação | Lógica de negócio real (subtotal, estoque por item, descontos de cupom e de pontos, validação do CPF pelos dígitos verificadores, fidelidade por CPF já cadastrado) | Dados em memória ([memory-store.ts](apps/api/src/db/memory-store.ts)), com o que o administrador configura gravado em disco ([persistencia.ts](apps/api/src/db/persistencia.ts), pasta `apps/api/data`) em vez do Postgres. **Carrinhos ainda em montagem se perdem ao reiniciar a API** |
| Pagamento | Calcula o valor certo (com descontos), baixa o estoque, conta o uso do cupom, debita/credita pontos e dá ao pedido um número de três dígitos | O gateway ([MockPagamentoGateway](apps/api/src/integrations/gateway-pagamento/mock-gateway.ts)) aprova qualquer pagamento instantaneamente — não existe adquirente real |
| Comprovante | Orquestra emissão fiscal + notificação e marca o pedido como finalizado | A nota fiscal é um número/URL fictícios ([MockEmissorFiscal](apps/api/src/integrations/api-fiscal/mock-emissor-fiscal.ts)); o e-mail/SMS só é logado no console do backend ([MockServicoNotificacao](apps/api/src/integrations/notificacao/mock-notificacao.ts)) |
| Frontend | Telas do cliente (cardápio com foto e quantidade, carrinho, CPF, cupom, pontos, pagamento, comprovante) e tela de administrador | As fontes escolhidas pelo administrador ficam salvas, mas ainda não são aplicadas no totem |

Dados de teste da instalação nova: cupons `BEMVINDO10` (10%), `DESC5` (R$ 5,00), `VALIDO` (15%, vigente) e `INVALIDO` (expirado); cliente de fidelidade com o CPF `123.456.789-09` e 1.250 pontos.

O caminho para produção é trocar cada mock por uma implementação real **sem alterar os módulos de negócio**: ligar `memory-store.ts` ao Postgres (schema já existe), e trocar as classes `Mock*` de cada pasta em `integrations/` por adapters reais — essa é exatamente a fronteira que a arquitetura foi desenhada para isolar (ver seção abaixo).

## Tela de administrador

O restaurante configura o totem em `http://localhost:5173/admin` (mesmo endereço do totem, com `/admin`). A entrada pede o PIN da variável `ADMIN_PIN`; sem ela, a API usa `1234` e avisa no log. No PowerShell: `$env:ADMIN_PIN = '482913'; npm run dev:api`. É uma trava simples, não um login com usuários.

| Aba | O que o administrador define |
|---|---|
| Aparência | Nome e frase do estabelecimento, logotipo (emoji ou imagem), cor do nome, do fundo e da barra do topo (as demais cores são calculadas por contraste), nome e descrição de cada página, fontes (salvas, ainda sem efeito) |
| Cardápio | Categorias (nome, ícone, ordem), aba "Todos" ligada ou desligada, produtos (foto ou emoji, nome, descrição, preço, categoria, quantidade à venda, disponível) |
| Fidelidade | Programa ligado ou desligado, acúmulo de pontos e seu percentual, quantos pontos valem R$ 1,00, se pontos somam com cupom; cadastro de clientes por CPF |
| Pagamento | Crédito, débito e Pix, cada um ligado ou desligado. Dinheiro é sempre aceito |
| Cupons | Aceitar cupons ou não; cada cupom com desconto, início e fim (data e hora) e quantidade de usos |
| Pedidos | Pedidos pagos aguardando retirada; o "OK, entregue" libera o número de três dígitos do pedido |
| Privacidade | Termo de consentimento exibido no totem e a auditoria de cada decisão dos clientes (só leitura) |

Regras que valem a pena saber:

- **As mudanças não são aplicadas ao vivo.** O totem lê a configuração quando inicia; depois de salvar em `/admin`, reinicie (recarregue) o totem.
- **Quantidade à venda** é opcional. Com ela, o item esgota sozinho quando as unidades acabam (a baixa acontece no pagamento) e o carrinho não passa do que resta.
- **O totem não cadastra clientes de fidelidade.** Um CPF válido que não está na lista do administrador é avisado de que não tem cadastro e segue sem fidelidade.
- **A lista de cupons mostra a situação de cada um** (Ativo, Desativado, Ainda não vale, Expirado, Esgotado), calculada pela mesma regra que o totem usa para aceitar ou recusar o código.
- **Os dados ficam em `apps/api/data`** (`estado.json`, `imagens/` e `auditoria-consentimento.jsonl`), fora do git. Apagar a pasta devolve o totem à configuração de fábrica — e apaga a auditoria.

## Privacidade (LGPD)

Nenhum dado pessoal é guardado sem o cliente concordar antes, finalidade por finalidade:

| Finalidade | Onde é pedida | Dado |
|---|---|---|
| CPF na nota fiscal | Identificação | CPF |
| CPF no programa de fidelidade | Identificação (só se o programa estiver ligado) | CPF |
| Comprovante por e-mail ou SMS | Comprovante | E-mail ou telefone |

- O totem mostra o aviso de finalidades com uma caixa de seleção para cada uma, todas desmarcadas. O teclado e os campos só são liberados depois de alguma ser marcada.
- A decisão é registrada antes de o dado sair do totem, e a API recusa (403) CPF, e-mail ou telefone de um pedido sem o "concordo" daquela finalidade.
- Recusar não interrompe a compra: o pedido segue e é concluído sem o dado.
- **Pular a identificação vale para o pedido inteiro:** o totem não pede CPF, e-mail nem telefone de novo, e a API não os aceita.
- Cada decisão (concordou ou recusou) vira uma linha na auditoria com data, hora, versão do termo e finalidade. A auditoria não contém CPF, e-mail nem telefone.
- O texto e a versão do termo ficam em [termo.ts](apps/api/src/modules/consentimento/termo.ts). Mudou o texto, aumente a versão.
- CPF nunca vai em URL (que cai no log do servidor), só no corpo das requisições.

## Separação por tiers

| Tier | Status | Recursos |
|---|---|---|
| **Básico (MVP)** | Em construção neste repositório | Cardápio digital, carrinho, fidelidade (opcional), CPF na nota, formas de pagamento, cupom de desconto, comprovante por e-mail/SMS |
| **Intermediário** | Futuro — não implementado | Impressora térmica, leitor de QR/código de barras |
| **Avançado** | Futuro — não implementado | Balança, identificação por RFID |

Toda integração externa (gateway de pagamento, emissor fiscal, notificação e, futuramente, hardware) vive em [apps/api/src/integrations/](apps/api/src/integrations/) como um **adapter**: uma interface TypeScript + uma implementação mock/stub. Os módulos de negócio em [apps/api/src/modules/](apps/api/src/modules/) dependem apenas da interface, nunca da implementação concreta — isso permite trocar de provedor, ou adicionar tiers futuros (ex.: `integrations/impressora/`, `integrations/rfid/`), sem tocar em `modules/`.

Por regra de segurança e conformidade, **nenhum dado de cartão é modelado ou armazenado** em nenhuma camada — o pagamento é sempre delegado ao gateway/adquirente via tokenização (ver [PagamentoGateway](apps/api/src/integrations/gateway-pagamento/PagamentoGateway.ts)).

Pontos de atenção LGPD (CPF, e-mail, telefone, número de fidelidade) estão sinalizados com o comentário `// LGPD: dado pessoal — exige consentimento/criptografia` em todos os arquivos que manipulam esses dados. O consentimento já é exigido e auditado (ver [Privacidade (LGPD)](#privacidade-lgpd)); a criptografia desses dados em repouso ainda não existe.

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
| — | Administração do totem | [Admin](apps/totem/src/screens/Admin) | [admin](apps/api/src/modules/admin) |
| — | Consentimento LGPD | [Identificacao](apps/totem/src/screens/Identificacao) e [Comprovante](apps/totem/src/screens/Comprovante) | [consentimento](apps/api/src/modules/consentimento) |

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
