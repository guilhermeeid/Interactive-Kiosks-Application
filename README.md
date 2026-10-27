# Totem de Autoatendimento

Plataforma de totem de autoatendimento multimodal para varejo/alimentação: o cliente navega no cardápio, monta o pedido, paga e recebe o comprovante sozinho.

O produto é **modular por camadas (tiers)**, com um princípio inegociável: **nenhum módulo de hardware é acoplado ao núcleo do sistema**. Isso é refletido na estrutura de código — ver [Separação por tiers](#separação-por-tiers) abaixo.

## Stack

- **Monorepo:** npm workspaces.
- **Frontend** ([apps/totem](apps/totem)): React 18 + TypeScript + Vite, para tela touch de pé (9:16) em modo kiosk.
- **Backend** ([apps/api](apps/api)): Node.js + TypeScript + Fastify.
- **Banco de dados:** PostgreSQL via Docker Compose.
- **Tipos compartilhados:** [packages/shared](packages/shared), consumido por frontend e backend.
- **Testes:** Vitest (frontend e backend).
- **Lint/format:** ESLint + Prettier, configurados na raiz.

> O MVP roda de ponta a ponta (início → fidelidade → cardápio → carrinho com cupom/pontos → pagamento com CPF na nota → nota e comprovante), ainda que de forma primitiva — ver [Estado atual do MVP](#estado-atual-do-mvp-o-que-é-real-e-o-que-é-mock) para o que já é lógica real e o que ainda é mock/placeholder.

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
| `ADMIN_PIN` | `apps/api` | PIN do modo Administrador da [área restrita](#área-restrita-administrador-e-funcionário) (padrão `1234`, só para desenvolvimento) |
| `FUNCIONARIO_PIN` | `apps/api` | PIN do modo Funcionário da área restrita (padrão `0000`, só para desenvolvimento) |
| `DATA_DIR` | `apps/api` | Pasta onde a API grava a configuração do administrador e as imagens (padrão `apps/api/data`) |
| `VITE_API_URL` | `apps/totem` | URL base da API consumida pelo frontend (padrão: porta `3333` da máquina que serviu a página) |

### 3. Banco de dados (Postgres via Docker Compose)

```bash
cd infra
docker-compose --env-file .env up -d
```

A migration inicial (estrutura das tabelas) está em [apps/api/src/db/migrations/0001_init.sql](apps/api/src/db/migrations/0001_init.sql); as seguintes (0002 a 0004) documentam o que foi acrescentado depois.

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
npm run dev:totem  # apps/totem -> http://localhost:5173 (cliente) e /admin (área restrita)
```

No monitor do computador, o totem aparece como uma coluna central na proporção 9:16, com o cursor redondo de teste; num totem de pé, ocupa a tela toda.

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
| Pagamento | Calcula o valor certo (com descontos), baixa o estoque (combos baixam os itens que os compõem), conta o uso do cupom, debita/credita pontos e dá ao pedido um número de três dígitos. Em dinheiro, reserva tudo e espera o caixa confirmar | O gateway ([MockPagamentoGateway](apps/api/src/integrations/gateway-pagamento/mock-gateway.ts)) aprova qualquer pagamento instantaneamente — não existe adquirente real |
| Comprovante | Orquestra emissão fiscal + notificação e marca o pedido como finalizado | A nota fiscal é um número/URL fictícios ([MockEmissorFiscal](apps/api/src/integrations/api-fiscal/mock-emissor-fiscal.ts)); o e-mail/SMS só é logado no console do backend ([MockServicoNotificacao](apps/api/src/integrations/notificacao/mock-notificacao.ts)) |
| Frontend | Telas do cliente (ver [Fluxo do totem](#fluxo-do-totem)), câmera lendo cupom (QR Code ou código de barras) e o QR do cartão de fidelidade, área restrita | As fontes escolhidas pelo administrador ficam salvas, mas ainda não são aplicadas no totem |

Dados de teste da instalação nova: cupons `BEMVINDO10` (10%), `DESC5` (R$ 5,00), `VALIDO` (15%, vigente) e `INVALIDO` (expirado); cliente de fidelidade com o CPF `123.456.789-09` e 1.250 pontos.

O caminho para produção é trocar cada mock por uma implementação real **sem alterar os módulos de negócio**: ligar `memory-store.ts` ao Postgres (schema já existe), e trocar as classes `Mock*` de cada pasta em `integrations/` por adapters reais — essa é exatamente a fronteira que a arquitetura foi desenhada para isolar (ver seção abaixo).

## Fluxo do totem

| Tela | O que acontece |
|---|---|
| 0 — Início | "Toque para começar" numa barra fixa embaixo; acima, as imagens de publicidade passam sozinhas, com bolinhas marcando o tempo de cada uma. Sem publicidade, aparece a marca da loja |
| 1 — Programa de fidelidade | Só com o programa ligado. CPF (depois do consentimento) ou QR Code do cartão pela câmera; mostra o saldo. "Pular" vale só para a fidelidade |
| 2 — Cardápio | Categorias no topo, à esquerda ou à direita; a capa da categoria aberta no alto. Tocar no item abre o detalhe (foto, descrição, o que vem no combo, quantidade). Barra fixa com Câmera (cupom ou cartão), Carrinho e Finalizar (vai direto ao pagamento) |
| 3 — Carrinho | Itens e quantidades, cupom (digitado ou lido pela câmera), pontos de fidelidade e o resumo (subtotal, cada desconto e o total a pagar) |
| 4 — Pagamento | "Para comer aqui" ou "Para levar", CPF na nota (com cadastro na fidelidade: "Incluir o mesmo CPF?", outro CPF ou nenhum) e a forma de pagamento |
| 5 — Nota e comprovante | Número do pedido, pontos acumulados e comprovante por e-mail/SMS. Em dinheiro: "Pague no caixa" com o número do pedido; a nota sai impressa no caixa |

O totem parado na Tela 0 se recarrega sozinho quando o servidor reinicia, para pegar o que o Administrador mudou. Um cliente no meio do pedido não é interrompido.

## Área restrita: Administrador e Funcionário

Fica em `http://localhost:5173/admin` (mesmo endereço do totem, com `/admin`). O PIN digitado define o modo: `ADMIN_PIN` entra como Administrador e `FUNCIONARIO_PIN` como Funcionário (sem as variáveis, `1234` e `0000`, e a API avisa no log). No PowerShell: `$env:ADMIN_PIN = '482913'; $env:FUNCIONARIO_PIN = '716204'; npm run dev:api`. É uma trava simples, não um login com usuários.

| Modo | Quando vale | O que muda |
|---|---|---|
| Administrador | **Quando o servidor reiniciar.** O que ele salva fica pendente (selo "pendente" em cada item e uma faixa com o resumo, com "Descartar pendências") | Tudo: aparência, cardápio, combos, fidelidade, pagamento, cupons, endereço dos termos. Pode alternar para o modo Funcionário |
| Funcionário | **Na hora** (os totens veem em até 30 segundos; a API já cobra o preço novo) | Marca item como esgotado (sem remover), troca preço, foto e descrição; recebe ou cancela pedidos em dinheiro no caixa; confirma a entrega no balcão |

Abas do Administrador:

| Aba | O que define |
|---|---|
| Aparência | Nome e frase, logotipo (emoji ou imagem), cores (as demais calculadas por contraste), nome e descrição de cada tela, publicidade da Tela 0 (até 10 imagens de pé e segundos por imagem), fontes (salvas, ainda sem efeito) |
| Cardápio | Categorias (nome, ícone em emoji ou imagem, foto de capa, ordem), posição das categorias (topo, esquerda ou direita), aba "Todos", produtos e combos |
| Fidelidade | Programa ligado ou desligado, acúmulo e seu percentual, quantos pontos valem R$ 1,00, se pontos somam com cupom; clientes por CPF (cadastro vale na hora) e o QR Code do cartão de cada um |
| Pagamento | Crédito, débito, Pix, vale-refeição, vale-alimentação e dinheiro, cada um ligado ou desligado (pelo menos um); "Para comer aqui" e "Para levar" (pelo menos um) |
| Cupons | Aceitar cupons ou não; cada cupom com desconto, validade, usos, para que vale (pedido inteiro, alguns itens ou algumas categorias), pedido mínimo e teto do percentual; QR Code de cada cupom |
| Privacidade | Endereço público dos Termos e Condições (o QR Code do totem leva a ele), o termo exibido e a auditoria do consentimento |

Regras que valem a pena saber:

- **Esgotado vale na hora**, mesmo antes de a tela dos totens se atualizar: a API recusa adicionar o item e recusa pagar um carrinho que já o tinha.
- **Quantidade à venda** é opcional. Com ela, o item esgota sozinho quando as unidades acabam (a baixa acontece no pagamento) e o carrinho não passa do que resta.
- **Combo** junta itens já cadastrados, cada um com sua quantidade, por um preço próprio. Não tem quantidade própria: esgota assim que qualquer item dele acaba, e o estoque é conferido somando o que o carrinho inteiro usa de cada item. Um item que está num combo não pode ser removido (nem virar combo) antes de sair dele.
- **Cupom precisa dar desconto** (US 36): zero, negativo ou mais de 100% é recusado ao salvar. Um cupom assim gravado por fora da área restrita aparece como "Valor inválido" e o totem não o aceita.
- **Cupom com regras**: só para alguns itens ou categorias (o desconto é calculado só sobre eles), a partir de um valor de pedido e, no percentual, com teto (ex.: 10% limitado a R$ 50,00). Se o carrinho deixa de cumprir a regra, o cupom sai sozinho e o carrinho avisa por quê.
- **Dinheiro**: o totem não recebe cédulas. O pedido vai para o caixa com o número de três dígitos, estoque, cupom e pontos reservados. O funcionário confere o CPF da nota (mascarado), recebe e a nota é emitida para impressão; os pontos entram nessa hora. Cancelar devolve tudo.
- **Vale-refeição e vale-alimentação** são formas de pagamento próprias (códigos 11 e 10 na NFC-e), não crédito nem débito, e precisam ser habilitados na credenciadora. Pela Lei 14.442/2022 o vale-alimentação é para gêneros alimentícios (mercados), por isso vem desligado.
- **O totem não cadastra clientes de fidelidade.** Um CPF válido que não está na lista é avisado de que não tem cadastro e segue sem fidelidade.
- **Os dados ficam em `apps/api/data`** (`estado.json`, `rascunho.json` com as pendências, `imagens/` e `auditoria-consentimento.jsonl`), fora do git. Apagar a pasta devolve o totem à configuração de fábrica — e apaga a auditoria.

## Privacidade (LGPD)

Nenhum dado pessoal é guardado sem o cliente concordar antes, finalidade por finalidade:

| Finalidade | Onde é pedida | Dado |
|---|---|---|
| CPF no programa de fidelidade | Tela 1 ou câmera (só se o programa estiver ligado) | CPF (pelo QR do cartão, só o id do cadastro) |
| CPF na nota fiscal | Tela 4 — Pagamento | CPF, que pode ser outro que não o da fidelidade |
| Comprovante por e-mail ou SMS | Tela 5 | E-mail ou telefone |

- O totem mostra o aviso de finalidades com uma caixa de seleção para cada uma, todas desmarcadas. O teclado e os campos só são liberados depois de alguma ser marcada.
- A decisão é registrada antes de o dado sair do totem, e a API recusa (403) CPF, e-mail ou telefone de um pedido sem o "concordo" daquela finalidade.
- Recusar não interrompe a compra: o pedido segue e é concluído sem o dado.
- **Cada finalidade é perguntada uma vez por pedido.** "Pular" a fidelidade não impede o CPF na nota nem o comprovante; uma finalidade recusada não volta a ser pedida, e a API recusa o dado dela.
- **"Termos e Condições"** (sublinhado, junto das caixas) abre o texto completo com um QR Code para ler no celular. O QR leva ao endereço informado na aba Privacidade ou, sem ele, à página `/consentimento/termos` da API, que precisa estar acessível pela internet para o celular abrir.
- **CPF na nota diferente do CPF da fidelidade é permitido:** nenhuma regra fiscal exige que sejam o mesmo, e a nota é emitida só para pessoa física.
- Cada decisão (concordou ou recusou) vira uma linha na auditoria com data, hora, versão do termo e finalidade. A auditoria não contém CPF, e-mail nem telefone.
- O texto e a versão do termo ficam em [termo.ts](apps/api/src/modules/consentimento/termo.ts). Mudou o texto, aumente a versão.
- CPF nunca vai em URL (que cai no log do servidor), só no corpo das requisições.

## Separação por tiers

| Tier | Status | Recursos |
|---|---|---|
| **Básico (MVP)** | Em construção neste repositório | Cardápio digital, carrinho, fidelidade (opcional), CPF na nota, formas de pagamento, cupom de desconto, comprovante por e-mail/SMS |
| **Intermediário** | Futuro — parcial | Impressora térmica (não implementada); leitor de QR/código de barras (cupom por QR Code ou código de barras e o QR do cartão de fidelidade já são lidos pela câmera do totem, em software; imagens de teste em [docs/cupons-de-teste](docs/cupons-de-teste)) |
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
| 2. Identificação do Cliente | US-04 Informar fidelidade | [Fidelidade](apps/totem/src/screens/Fidelidade) | [identificacao](apps/api/src/modules/identificacao) |
| 2. Identificação do Cliente | US-05 Informar CPF na nota | [Pagamento](apps/totem/src/screens/Pagamento) | [identificacao](apps/api/src/modules/identificacao) |
| 3. Pagamento e Cupons | US-06 Escolher forma de pagamento | [Pagamento](apps/totem/src/screens/Pagamento) | [pagamento](apps/api/src/modules/pagamento) (via [gateway-pagamento](apps/api/src/integrations/gateway-pagamento)) |
| 3. Pagamento e Cupons | US-07 Aplicar cupom | [Carrinho](apps/totem/src/screens/Carrinho) | [cupom](apps/api/src/modules/cupom) |
| 4. Emissão de Comprovante | US-08 Receber comprovante por e-mail/SMS | [Comprovante](apps/totem/src/screens/Comprovante) | [comprovante](apps/api/src/modules/comprovante) (via [api-fiscal](apps/api/src/integrations/api-fiscal) e [notificacao](apps/api/src/integrations/notificacao)) |
| — | Tela inicial e publicidade | [Inicio](apps/totem/src/screens/Inicio) | [admin](apps/api/src/modules/admin) (configuração) |
| — | Administração do totem | [Admin](apps/totem/src/screens/Admin) | [admin](apps/api/src/modules/admin) |
| — | Caixa e balcão (modo Funcionário) | [Admin](apps/totem/src/screens/Admin) | [funcionario](apps/api/src/modules/funcionario) |
| — | Consentimento LGPD | [Fidelidade](apps/totem/src/screens/Fidelidade), [Pagamento](apps/totem/src/screens/Pagamento) e [Comprovante](apps/totem/src/screens/Comprovante) | [consentimento](apps/api/src/modules/consentimento) |

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
