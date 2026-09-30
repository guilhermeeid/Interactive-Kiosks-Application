# Auditoria do escopo entregue — US concluídas

Data: 2026-09-29 · Branch: `main` (commit `5e6940f`, com `README.md` modificado e não commitado) · Auditoria somente leitura.

---

## 1. Resumo executivo

- Das 9 US declaradas como concluídas, **1 está completa** (US 04), **6 estão parciais** (US 01, 03, 05, 06, 24, 26) e **2 não atendem** a nenhum critério (US 02 — busca; US 08 — saldo de fidelidade).
- Foram encontradas **implementações fora do escopo ligadas a 9 US** (09, 10, 11, 13, 14, 15, 38, 41, 42), **todas expostas na interface do totem**, e mais **3 funcionalidades sem história** no backlog (pagamento em "Dinheiro", auto-cadastro de fidelidade e campo `observacoes` no item do pedido).
- Não há nada do modo administrador nem de hardware (tiers Intermediário e Avançado) além de comentários.
- **Causa provável da divergência:** o código e o `README.md` seguem uma **numeração antiga de 8 histórias** (US-01 a US-08), que não coincide com o backlog atual de 46 histórias (ver 1.1).

### 1.1 Divergência de numeração das US (a "questão das US")

Os comentários do código, os tipos compartilhados e a tabela "Mapa de módulos/telas por história" do [README.md](../README.md) (linhas 112–123) usam rótulos US-01…US-08 que pertencem a outro backlog. Correspondência com o backlog atual:

| Rótulo no código/README | Significado no código | US equivalente(s) no backlog de 46 | Situação no escopo |
|---|---|---|---|
| US-01 Visualizar cardápio | [cardapio.service.ts](../apps/api/src/modules/cardapio/cardapio.service.ts) | US 01 | Dentro |
| US-02 Adicionar ao carrinho | [carrinho.service.ts:10-34](../apps/api/src/modules/carrinho/carrinho.service.ts) | **US 03** (não é a busca da US 02) | Dentro |
| US-03 Revisar/editar carrinho | [carrinho.service.ts:36-67](../apps/api/src/modules/carrinho/carrinho.service.ts) | **US 04 + US 05** | Dentro |
| US-04 Informar fidelidade | [identificacao.service.ts:9-25](../apps/api/src/modules/identificacao/identificacao.service.ts) | **US 08** (parcial) | Dentro |
| US-05 Informar CPF na nota | [identificacao.service.ts:27-40](../apps/api/src/modules/identificacao/identificacao.service.ts) | **US 09** | **Fora** |
| US-06 Escolher forma de pagamento | [pagamento.service.ts](../apps/api/src/modules/pagamento/pagamento.service.ts) | **US 11 + US 38** (não é o resumo da US 06) | **Fora** |
| US-07 Aplicar cupom | [cupom.service.ts](../apps/api/src/modules/cupom/cupom.service.ts) | **US 13** (+ regra da US 24) | **Fora** (exceto a regra de vigência) |
| US-08 Receber comprovante por e-mail/SMS | [comprovante.service.ts](../apps/api/src/modules/comprovante/comprovante.service.ts) | **US 15 + US 41 + US 42** (não é o saldo da US 08) | **Fora** |

Consequência: o que foi entregue como "US-01 a US-08" é o fluxo completo antigo (cardápio → carrinho → identificação → pagamento/cupom → comprovante). Pelo backlog atual, esse fluxo cobre só parte das 9 US concluídas e implementa várias US ainda "A fazer". Quem ler "US-06" ou "US-08" no código vai associar ao item errado do backlog.

---

## 2. Como a verificação foi feita

| Etapa | Comando / método | Resultado |
|---|---|---|
| Mapeamento | `git ls-files` (95 arquivos) e leitura integral de `apps/api`, `apps/totem`, `packages/shared` e `infra` | Stack: monorepo npm workspaces; React 18 + Vite (totem); Fastify 4 (API); tipos em `packages/shared`; Postgres via Docker Compose |
| Testes | `npm test` | **passou**: 27 testes (API: 7 arquivos / 24 testes; totem: 1 arquivo / 3 testes) |
| Typecheck | `npm run typecheck` | **passou** (3 workspaces) |
| Lint | `npm run lint` | **passou** (sem avisos) |
| API em execução | `API_PORT=3399 npx tsx apps/api/src/server.ts` + chamadas `curl` a todos os endpoints | **subiu**; respostas registradas nas seções 3 e 6 |
| Totem em execução | `VITE_API_URL=http://localhost:3399 npx vite --port 5199` + Chrome headless `--screenshot` | **subiu**; captura só da tela inicial (Cardápio). As outras telas dependem de interação e foram verificadas por leitura de código |
| Banco de dados | Não subido | **Não necessário**: nenhum código conecta ao Postgres. A API usa só o armazenamento em memória de [memory-store.ts](../apps/api/src/db/memory-store.ts). A migration [0001_init.sql](../apps/api/src/db/migrations/0001_init.sql) não é executada por nenhuma ferramenta |
| Testes E2E | — | **inexistentes** (sem Playwright/Cypress no repositório) |
| Testes de componente do totem | — | **inexistentes** (o único teste do totem é [formatarMoeda.test.ts](../apps/totem/src/utils/formatarMoeda.test.ts)) |

O que a captura da tela inicial mostra: título "Cardápio", uma grade única com os 5 itens do seed (nome, descrição, preço e botão "Adicionar") e o botão desabilitado "Ver carrinho (0)". **Não aparecem** categorias, fotos, campo de busca nem resumo de valores. A captura ficou fora do repositório, que é somente leitura nesta auditoria.

Legenda da coluna "Visualizável no totem": **sim (execução)** = observado na captura ou em chamada real; **sim (código)** = presente na tela segundo o código, sem navegação automatizada; **não** = ausente na interface.

---

## 3. Verificação das 9 US concluídas

| US | Critério de aceite | Código (arquivo) | Teste automatizado | Visualizável no totem | Situação |
|---|---|---|---|---|---|
| 01 | Tocar em uma categoria exibe itens com nome, foto, descrição e preço | Backend filtra por `?categoria=` em [cardapio.service.ts:7-11](../apps/api/src/modules/cardapio/cardapio.service.ts). O totem chama `/cardapio` **sem** categoria ([apiClient.ts:30-32](../apps/totem/src/services/apiClient.ts)) e exibe grade plana **sem foto** ([CardapioScreen.tsx:45-54](../apps/totem/src/screens/Cardapio/CardapioScreen.tsx)); `imagemUrl` nunca é renderizado e nenhum item do seed tem foto | [cardapio.service.test.ts:11-15](../apps/api/src/modules/cardapio/cardapio.service.test.ts) (só backend), passou | Não: sem categorias nem fotos (execução) | ⚠️ Parcial |
| 01 | Categoria sem itens exibe "Nenhum item disponível nesta categoria" | Backend retorna `[]` para categoria vazia. A mensagem **não existe** em nenhum arquivo do totem | [cardapio.service.test.ts:17-20](../apps/api/src/modules/cardapio/cardapio.service.test.ts) (só backend), passou | Não | ❌ Não atende |
| 02 | Digitar parte do nome exibe os itens correspondentes | **Não implementado.** Não há campo de busca em [CardapioScreen.tsx](../apps/totem/src/screens/Cardapio/CardapioScreen.tsx) nem parâmetro de busca em [cardapio.types.ts](../apps/api/src/modules/cardapio/cardapio.types.ts). Em execução, `GET /cardapio?busca=lanche` devolveu os 5 itens (parâmetro ignorado) | Inexistente | Não (execução) | ❌ Não atende |
| 02 | Busca sem resultado exibe "Nenhum item encontrado" | Não implementado; texto ausente no código | Inexistente | Não | ❌ Não atende |
| 03 | Selecionar quantidade e tocar em "adicionar ao carrinho" adiciona o item e recalcula o total | Adição e recálculo no backend em [carrinho.service.ts:12-34](../apps/api/src/modules/carrinho/carrinho.service.ts). **Não há** tela de detalhe do item nem seletor de quantidade: o botão "Adicionar" do cardápio envia `quantidade: 1` fixo ([CardapioScreen.tsx:23-34](../apps/totem/src/screens/Cardapio/CardapioScreen.tsx)). O total só aparece na tela do carrinho (o cardápio mostra apenas a contagem de itens) | [carrinho.service.test.ts:7-21](../apps/api/src/modules/carrinho/carrinho.service.test.ts), passou | Parcial: botão "Adicionar" visível (execução); sem detalhe nem quantidade | ⚠️ Parcial |
| 03 | Item indisponível: exibe "Item indisponível no momento" e impede a adição | Bloqueio no backend em [carrinho.service.ts:15-17](../apps/api/src/modules/carrinho/carrinho.service.ts), com a mensagem `Item de cardápio "<id>" indisponível` (texto diferente do critério). No totem o item indisponível **some da lista** ([cardapio.service.ts:8-10](../apps/api/src/modules/cardapio/cardapio.service.ts)), então o cliente não consegue nem tentar adicioná-lo | O teste existente cobre item **inexistente** ([carrinho.service.test.ts:23-28](../apps/api/src/modules/carrinho/carrinho.service.test.ts)), não item com `disponivel: false` | Não verificável: o seed não tem item indisponível | ⚠️ Parcial |
| 04 | Alterar a quantidade para valor > 0 recalcula subtotal e total | Botões −/+ em [CarrinhoScreen.tsx:43-49](../apps/totem/src/screens/Carrinho/CarrinhoScreen.tsx); backend em [carrinho.service.ts:38-53](../apps/api/src/modules/carrinho/carrinho.service.ts); subtotal da linha (l. 51) e total (l. 57) vêm do pedido recarregado | Inexistente para quantidade > 0 (o teste de `atualizarItem` cobre só 0 e 404) | Sim (código) | ✅ Atende (sem teste) |
| 04 | Reduzir a quantidade a zero remove o item | [carrinho.service.ts:45-46](../apps/api/src/modules/carrinho/carrinho.service.ts). No totem, "−" com quantidade 1 envia 0 | [carrinho.service.test.ts:32-40](../apps/api/src/modules/carrinho/carrinho.service.test.ts), passou | Sim (código) | ✅ Atende |
| 05 | Tocar em "remover" retira o item e recalcula o total | Botão "Remover" em [CarrinhoScreen.tsx:52](../apps/totem/src/screens/Carrinho/CarrinhoScreen.tsx); backend em [carrinho.service.ts:56-61](../apps/api/src/modules/carrinho/carrinho.service.ts) | [carrinho.service.test.ts:57-66](../apps/api/src/modules/carrinho/carrinho.service.test.ts), passou (verifica a lista, não o total) | Sim (código) | ✅ Atende |
| 05 | Carrinho vazio após remoção volta ao cardápio | **Não implementado.** A tela permanece no carrinho mostrando "Seu carrinho está vazio." ([CarrinhoScreen.tsx:36](../apps/totem/src/screens/Carrinho/CarrinhoScreen.tsx)); não há `irParaEtapa('cardapio')` automático | Inexistente | Não | ❌ Não atende |
| 06 | Adicionar, remover ou alterar atualiza subtotal e total imediatamente | Não há componente fixo de resumo. No cardápio aparece só "Ver carrinho (N)" (contagem, sem valor) em [CardapioScreen.tsx:56-58](../apps/totem/src/screens/Cardapio/CardapioScreen.tsx). No carrinho há só "Total" ([CarrinhoScreen.tsx:57](../apps/totem/src/screens/Carrinho/CarrinhoScreen.tsx)), atualizado após cada ação; não há linha de subtotal separada | Inexistente no frontend; cálculo coberto em [memory-store.test.ts:16-28](../apps/api/src/db/memory-store.test.ts) | Parcial: total só na tela do carrinho | ⚠️ Parcial |
| 06 | Desconto aparece destacado, separado do subtotal | Não existe componente de resumo que aceite desconto. O único lugar onde aparece desconto é a tela de Pagamento ("Desconto: …", [PagamentoScreen.tsx:70](../apps/totem/src/screens/Pagamento/PagamentoScreen.tsx)), alimentada pelo **campo de cupom da US 13, que não deveria existir**; ali também não há subtotal | Inexistente | Só através de funcionalidade fora do escopo | ❌ Não atende |
| 08 | Número de fidelidade válido: exibe o saldo de pontos | O backend retorna `pontos` ([identificacao.service.ts:12-25](../apps/api/src/modules/identificacao/identificacao.service.ts)), mas o cliente HTTP tipa o retorno como `Promise<void>` e descarta a resposta ([apiClient.ts:69-74](../apps/totem/src/services/apiClient.ts)). A tela vai direto para Pagamento ([IdentificacaoScreen.tsx:19-35](../apps/totem/src/screens/Identificacao/IdentificacaoScreen.tsx)). **O saldo nunca é exibido** | [identificacao.service.test.ts:6-20](../apps/api/src/modules/identificacao/identificacao.service.test.ts) (só backend), passou | Não | ❌ Não atende |
| 08 | Número sem cadastro: informa que não encontrou e oferece seguir sem fidelidade | **Comportamento oposto:** número desconhecido cria automaticamente um cliente com 0 pontos ([identificacao.service.ts:17-21](../apps/api/src/modules/identificacao/identificacao.service.ts)). Confirmado em execução: `POST /identificacao/fidelidade {"numeroFidelidade":"999"}` retornou um cliente novo. Não existe a mensagem "não encontrado" | O teste [identificacao.service.test.ts:7-12](../apps/api/src/modules/identificacao/identificacao.service.test.ts) **valida o comportamento contrário** ao critério | Não | ❌ Não atende |
| 24 | Cupom com data de início e validade é válido dentro da vigência | O modelo **não tem data de início**: só `validoAte`/`valido_ate` ([Cupom.ts:6-12](../packages/shared/src/types/Cupom.ts), [0001_init.sql:22-28](../apps/api/src/db/migrations/0001_init.sql)). Os cupons não estão no banco: são uma lista fixa em [memory-store.ts:67-70](../apps/api/src/db/memory-store.ts). A tabela `cupons` não é usada por nenhum código. A regra fica em [cupom.service.ts:8-21](../apps/api/src/modules/cupom/cupom.service.ts), acessível só pelo endpoint de aplicação no totem (US 13) | [cupom.service.test.ts:8-19](../apps/api/src/modules/cupom/cupom.service.test.ts) (cupom sem datas), passou | N/A (backend) | ⚠️ Parcial |
| 24 | Cupom expirado é recusado automaticamente | Checagem de `validoAte` em [cupom.service.ts:15-17](../apps/api/src/modules/cupom/cupom.service.ts) | **Inexistente** (nenhum teste com cupom expirado; nenhum cupom do seed tem data) | N/A (backend) | ⚠️ Parcial (regra existe, sem teste nem dado de verificação) |
| 26 | Item marcado indisponível (via banco) não pode ser adicionado em nenhum totem | Campo `disponivel` em [0001_init.sql:12](../apps/api/src/db/migrations/0001_init.sql) e [ItemCardapio.ts:11](../packages/shared/src/types/ItemCardapio.ts). Filtro na listagem ([cardapio.service.ts:8-10](../apps/api/src/modules/cardapio/cardapio.service.ts)) e bloqueio na adição ([carrinho.service.ts:15-17](../apps/api/src/modules/carrinho/carrinho.service.ts)). **Não há banco conectado:** a marcação só pode ser feita editando [memory-store.ts:17-58](../apps/api/src/db/memory-store.ts) e reiniciando a API. O item some em vez de aparecer como indisponível | Inexistente para `disponivel: false`; o teste [cardapio.service.test.ts:5-9](../apps/api/src/modules/cardapio/cardapio.service.test.ts) não prova nada, porque todos os itens do seed estão disponíveis | Não verificado em execução (seed sem item indisponível) | ⚠️ Parcial |
| 26 | Reverter a marcação (via banco) e recarregar o cardápio devolve o item | O cardápio é buscado a cada montagem da tela ([CardapioScreen.tsx:15-20](../apps/totem/src/screens/Cardapio/CardapioScreen.tsx)), mas reverter exige editar o código e reiniciar a API, o que apaga todos os pedidos em memória | Inexistente | Não verificado em execução | ⚠️ Parcial |

Consolidado por US:

| US | Situação geral |
|---|---|
| 01 | ⚠️ Parcial: sem categorias nem fotos no totem e sem mensagem de categoria vazia |
| 02 | ❌ Não atende: busca inexistente |
| 03 | ⚠️ Parcial: sem tela de detalhe nem seletor de quantidade; mensagem de indisponível diferente |
| 04 | ✅ Atende (critério 1 sem teste) |
| 05 | ⚠️ Parcial: sem redirecionamento com carrinho vazio |
| 06 | ⚠️ Parcial: sem resumo fixo, sem subtotal separado, sem componente de desconto |
| 08 | ❌ Não atende: saldo não exibido; número desconhecido vira cadastro novo |
| 24 | ⚠️ Parcial: sem data de início, cupons fora do banco, expiração sem teste |
| 26 | ⚠️ Parcial: lógica existe, mas sem banco conectado e sem teste com item indisponível |

---

## 4. Implementações fora do escopo

| US | O que foi encontrado | Arquivos | Grau | Exposto no totem? |
|---|---|---|---|---|
| 09 — CPF na nota | Teclado numérico para CPF, endpoint `POST /identificacao/cpf-nota`, validação de formato (11 dígitos, sem dígito verificador), CPF gravado no pedido e repassado ao emissor fiscal | [IdentificacaoScreen.tsx:48-52](../apps/totem/src/screens/Identificacao/IdentificacaoScreen.tsx), [identificacao.service.ts:27-40](../apps/api/src/modules/identificacao/identificacao.service.ts), [identificacao.routes.ts:13-17](../apps/api/src/modules/identificacao/identificacao.routes.ts), [comprovante.service.ts:19-22](../apps/api/src/modules/comprovante/comprovante.service.ts), coluna `cpf_na_nota` em [0001_init.sql:35](../apps/api/src/db/migrations/0001_init.sql) | Parcial | Sim |
| 10 — Pular identificação | O botão da tela de identificação vira "Pular" quando nada foi digitado e segue para o pagamento | [IdentificacaoScreen.tsx:56-58](../apps/totem/src/screens/Identificacao/IdentificacaoScreen.tsx) | Parcial | Sim |
| 11 — PIX | Botão "Pix" que chama `POST /pagamento`; o gateway mock autoriza na hora e o pedido vira `pago`. Sem QR Code, contador ou webhook | [PagamentoScreen.tsx:8-13, 37-54, 77-83](../apps/totem/src/screens/Pagamento/PagamentoScreen.tsx), [pagamento.service.ts](../apps/api/src/modules/pagamento/pagamento.service.ts), [pagamento.routes.ts](../apps/api/src/modules/pagamento/pagamento.routes.ts), [mock-gateway.ts](../apps/api/src/integrations/gateway-pagamento/mock-gateway.ts) | Parcial (mock funcional) | Sim |
| 38 — Cartão | Botões "Crédito" e "Débito" no mesmo fluxo mock. Sem pinpad/TEF | Mesmos arquivos da US 11; tipo `FormaPagamento` em [Pagamento.ts:9](../packages/shared/src/types/Pagamento.ts) | Parcial (mock funcional) | Sim |
| 13 — Aplicar cupom no totem | Campo "Código do cupom" + botão "Aplicar", endpoint `POST /cupom/aplicar`, cálculo de desconto percentual e fixo, total com desconto usado na cobrança. **O prompt da auditoria diz explicitamente que esse campo não deve existir** | [PagamentoScreen.tsx:26-35, 62-71](../apps/totem/src/screens/Pagamento/PagamentoScreen.tsx), [cupom.routes.ts](../apps/api/src/modules/cupom/cupom.routes.ts), [cupom.service.ts](../apps/api/src/modules/cupom/cupom.service.ts), [memory-store.ts:98-118](../apps/api/src/db/memory-store.ts), [apiClient.ts:85-91](../apps/totem/src/services/apiClient.ts) | Completo no fluxo básico (sem registro de uso) | Sim |
| 14 — Trocar cupom | Aplicar outro código sobrescreve `pedido.cupomAplicado` e recalcula. Não há botão "remover cupom" | [cupom.service.ts:19](../apps/api/src/modules/cupom/cupom.service.ts) | A confirmar (efeito colateral, não uma funcionalidade deliberada) | Sim, implicitamente |
| 15 — NFC-e | Interface `EmissorFiscal` + `MockEmissorFiscal` chamados no fechamento; a tela final exibe "Nota fiscal: <URL fictícia>". Sem QR Code nem chave de acesso | [EmissorFiscal.ts](../apps/api/src/integrations/api-fiscal/EmissorFiscal.ts), [mock-emissor-fiscal.ts](../apps/api/src/integrations/api-fiscal/mock-emissor-fiscal.ts), [comprovante.service.ts:19-22](../apps/api/src/modules/comprovante/comprovante.service.ts), [ComprovanteScreen.tsx:43](../apps/totem/src/screens/Comprovante/ComprovanteScreen.tsx) | Parcial (mock funcional) | Sim |
| 41 — Comprovante por e-mail | Tela "Comprovante" com opção E-mail e campo de texto; `POST /comprovante`; mock que só faz log. O pedido é marcado `finalizado` | [ComprovanteScreen.tsx](../apps/totem/src/screens/Comprovante/ComprovanteScreen.tsx), [comprovante.service.ts](../apps/api/src/modules/comprovante/comprovante.service.ts), [comprovante.routes.ts](../apps/api/src/modules/comprovante/comprovante.routes.ts), [mock-notificacao.ts](../apps/api/src/integrations/notificacao/mock-notificacao.ts), tabela `comprovantes` em [0001_init.sql:51-58](../apps/api/src/db/migrations/0001_init.sql) | Parcial (mock funcional, sem validação de e-mail) | Sim |
| 42 — Comprovante por SMS | Opção SMS com teclado numérico de 11 dígitos, no mesmo fluxo | [ComprovanteScreen.tsx:59-75](../apps/totem/src/screens/Comprovante/ComprovanteScreen.tsx) e mesmos arquivos da US 41 | Parcial (mock funcional) | Sim |
| Sem história | Forma de pagamento **"Dinheiro"**, sem US correspondente no backlog | [PagamentoScreen.tsx:12](../apps/totem/src/screens/Pagamento/PagamentoScreen.tsx), [Pagamento.ts:9](../packages/shared/src/types/Pagamento.ts) | Parcial (mock) | Sim |
| Sem história | **Auto-cadastro de fidelidade**: número desconhecido cria cliente com 0 pontos. Nenhuma US prevê cadastro de cliente no totem, e isso contraria a US 08 | [identificacao.service.ts:17-21](../apps/api/src/modules/identificacao/identificacao.service.ts) | Completo | Sim (efeito invisível ao cliente) |
| Sem história | Campo `observacoes` no item do pedido, aceito pelo endpoint de adição | [carrinho.service.ts:28](../apps/api/src/modules/carrinho/carrinho.service.ts), [Pedido.ts:9](../packages/shared/src/types/Pedido.ts), [0001_init.sql:47](../apps/api/src/db/migrations/0001_init.sql) | A confirmar (sem UI) | Não, só no código |

Varreduras sem ocorrências, nem parciais: modo administrador (US 35, 23, 31, 32, 33, 34, 36, 39, 40, 44, 25, 45, 27, 19; `GET /admin` e `GET /login` retornam 404, não há app `admin`, tabela de usuários, hash, JWT nem upload); US 07 e 37 (crédito e resgate de pontos); US 29 (consentimento LGPD; só TODOs); US 12 (timeout de pagamento); US 16 (falha de envio); US 28 (não há campos de cartão, só comentários de regra); US 43; US 46; hardware (US 17, 18, 20, 21, 22, 30; sem ESC/POS, serial/HID, Electron/Tauri ou hardware bridge). As dependências de `package.json` se limitam a React, Fastify, `@fastify/cors`, `@fastify/sensible`, Vite, Vitest, ESLint e Prettier, sem SDKs de PSP, fiscal, SendGrid ou Twilio. [.env.example](../infra/.env.example) só tem variáveis de Postgres, porta e URL da API.

---

## 5. Stubs/TODOs encontrados (informativo)

- [useKioskMode.ts:5-11](../apps/totem/src/hooks/useKioskMode.ts): `useEffect` vazio; fullscreen e bloqueio de menu de contexto por fazer.
- [BotaoTouch.tsx:4](../apps/totem/src/components/BotaoTouch.tsx): estilo visual definitivo.
- [global.css:26](../apps/totem/src/styles/global.css): variáveis de tema.
- [schema.ts:2](../apps/api/src/db/schema.ts): só tipos de linha; ORM/query builder não escolhido.
- [0001_init.sql:2](../apps/api/src/db/migrations/0001_init.sql): ferramenta de migração não definida; o arquivo só documenta o schema.
- [memory-store.ts:13](../apps/api/src/db/memory-store.ts): substituir por queries ao Postgres.
- [env.ts:9](../apps/api/src/config/env.ts): validação de variáveis de ambiente.
- [cors.ts:5](../apps/api/src/plugins/cors.ts): restringir `origin`.
- [identificacao.service.ts:28](../apps/api/src/modules/identificacao/identificacao.service.ts): dígito verificador do CPF.
- [IdentificacaoScreen.tsx:11](../apps/totem/src/screens/Identificacao/IdentificacaoScreen.tsx) e [ComprovanteScreen.tsx:11](../apps/totem/src/screens/Comprovante/ComprovanteScreen.tsx): texto de consentimento LGPD.
- [mock-gateway.ts:8](../apps/api/src/integrations/gateway-pagamento/mock-gateway.ts), [mock-emissor-fiscal.ts:7](../apps/api/src/integrations/api-fiscal/mock-emissor-fiscal.ts), [mock-notificacao.ts:6](../apps/api/src/integrations/notificacao/mock-notificacao.ts): adapters reais.
- [pagamento.routes.ts:8](../apps/api/src/modules/pagamento/pagamento.routes.ts) e [comprovante.routes.ts:9](../apps/api/src/modules/comprovante/comprovante.routes.ts): injeção de dependência.
- [ItemCardapio.ts:14](../packages/shared/src/types/ItemCardapio.ts): variações/complementos.
- `PagamentoGateway.consultarStatus`/`estornar` ([PagamentoGateway.ts:18-19](../apps/api/src/integrations/gateway-pagamento/PagamentoGateway.ts)): implementados no mock, mas nenhum módulo os chama.
- [integrations/index.ts:6-10](../apps/api/src/integrations/index.ts): só comentário prevendo pastas futuras de hardware (`impressora/`, `rfid/`), que não existem.

---

## 6. Riscos observados

1. **Dados pessoais em texto claro e sem consentimento.** CPF (`pedido.cpfNaNota`), número de fidelidade (chave de `clientesFidelidade`), e-mail e telefone (`comprovantes`) ficam em memória sem criptografia ([memory-store.ts:60-65](../apps/api/src/db/memory-store.ts)). As colunas equivalentes da migration são `TEXT` simples ([0001_init.sql:18, 35, 55](../apps/api/src/db/migrations/0001_init.sql)). Não existe fluxo de consentimento (US 29).
2. **Dado pessoal em log.** [mock-notificacao.ts:13](../apps/api/src/integrations/notificacao/mock-notificacao.ts) escreve e-mail ou telefone no console. Confirmado no teste: `[mock-notificacao] Comprovante enviado por email para cliente@teste.com`.
3. **Exposição de CPF pela API sem autenticação.** `GET /carrinho/:pedidoId` devolve o pedido inteiro, inclusive `cpfNaNota` e `clienteId` (confirmado em execução). O `pedidoId` é gerado no navegador; fora de HTTPS/localhost ele cai num fallback baseado em `Date.now()` + `Math.random()` ([PedidoContext.tsx:23-28](../apps/totem/src/contexts/PedidoContext.tsx)).
4. **Quantidade sem validação (afeta US 03, que está no escopo).** [carrinho.service.ts:20-30](../apps/api/src/modules/carrinho/carrinho.service.ts) aceita quantidade negativa ou fracionada. Reproduzido: adicionar `quantidade: -5` gerou `valorTotalCentavos: -4450`; em seguida o cupom `DESC5` calculou desconto de `-4450` e `POST /pagamento` autorizou R$ 0,00. Não há schema de validação nos bodies das rotas Fastify.
5. **Fluxo sem checagem de estado (funcionalidades fora do escopo).** `POST /comprovante` marca o pedido como `finalizado` sem verificar pagamento ([comprovante.service.ts:38](../apps/api/src/modules/comprovante/comprovante.service.ts)). `POST /pagamento` aceita carrinho vazio e pagamento repetido ([pagamento.service.ts:10-28](../apps/api/src/modules/pagamento/pagamento.service.ts)).
6. **Persistência inexistente.** Todo o estado vive em memória e é perdido ao reiniciar a API. Por isso os critérios "via banco" das US 24 e 26 não podem ser exercidos como descritos.
7. **Pontos sem risco:** nenhum campo de dado de cartão existe em tipos, migration ou telas ([Pagamento.ts](../packages/shared/src/types/Pagamento.ts), [0001_init.sql:60-61](../apps/api/src/db/migrations/0001_init.sql)). Nenhum módulo de hardware está acoplado ao núcleo.
