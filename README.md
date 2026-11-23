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

A API lê o `infra/.env` sozinha ao iniciar (e `apps/api/.env`, se existir); uma variável definida no terminal vale mais que a do arquivo. Com `npm run dev:api`, salvar o `.env` reinicia a API sozinha.

Variáveis disponíveis:

| Variável | Usado por | Descrição |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | `infra/docker-compose.yml` | Credenciais e porta do Postgres local |
| `DATABASE_URL` | `apps/api` | String de conexão do backend com o Postgres |
| `API_PORT` | `apps/api` | Porta HTTP do backend Fastify (padrão `3333`) |
| `ADMIN_PIN` | `apps/api` | PIN do modo Administrador da [área restrita](#área-restrita-administrador-e-funcionário) (padrão `1234`, só para desenvolvimento) |
| `FUNCIONARIO_PIN` | `apps/api` | PIN do modo Funcionário da área restrita (padrão `0000`, só para desenvolvimento) |
| `ACESSO_BLOQUEIO_MINUTOS` / `SESSAO_INATIVA_MINUTOS` | `apps/api` | Bloqueio depois de 5 PINs errados seguidos (padrão 5 min) e expiração da sessão sem uso (padrão 30 min) |
| `PIX_EXPIRACAO_SEGUNDOS` / `PIX_TEMPO_LIMITE_MS` | `apps/api` | Validade do QR Code Pix (padrão 300 s) e espera máxima pelo banco (padrão 10000 ms) |
| `PIX_WEBHOOK_TOKEN` | `apps/api` | Segredo que o banco envia no cabeçalho `x-webhook-token` do webhook do Pix (padrão só para desenvolvimento; a API avisa no log) |
| `FISCAL_TEMPO_LIMITE_MS` | `apps/api` | Espera máxima pela autorização da NFC-e (padrão 15000 ms) |
| `SMTP_HOST`, `SMTP_PORTA`, `SMTP_USUARIO`, `SMTP_SENHA`, `SMTP_REMETENTE` (e `SMTP_SEGURO`) | `apps/api` | E-mail do comprovante de verdade, por qualquer servidor SMTP (Gmail com senha de app, Outlook, SendGrid, SES...). Sem `SMTP_HOST`, o e-mail é simulado. Ver [Comprovante por e-mail e SMS](#comprovante-por-e-mail-e-sms) |
| `NOTIFICACAO_TEMPO_LIMITE_MS` | `apps/api` | Espera máxima pelo provedor de e-mail/SMS (padrão 20000 ms) |
| `MOCK_PIX_PAGAR_APOS_SEGUNDOS`, `MOCK_PIX_ATRASO_MS`, `MOCK_PIX_WEBHOOK_ATRASO_MS`, `MOCK_FISCAL_FALHA`, `MOCK_NOTIFICACAO_FALHA` | `apps/api` | Só desenvolvimento: simulam o banco e a SEFAZ (ver [Simulando Pix e NFC-e](#simulando-pix-e-nfc-e)) |
| `DATA_DIR` | `apps/api` | Pasta onde a API grava a configuração do administrador e as imagens (padrão `apps/api/data`) |
| `VITE_API_URL` | `apps/totem` | URL base da API consumida pelo frontend (padrão: porta `3333` da máquina que serviu a página) |

### 3. Banco de dados (Postgres via Docker Compose)

```bash
cd infra
docker-compose --env-file .env up -d
```

A migration inicial (estrutura das tabelas) está em [apps/api/src/db/migrations/0001_init.sql](apps/api/src/db/migrations/0001_init.sql); as seguintes (0002 a 0006) documentam o que foi acrescentado depois.

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
| Pagamento | Calcula o valor certo (com descontos), baixa o estoque (combos baixam os itens que os compõem), conta o uso do cupom, debita/credita pontos e dá ao pedido um número de três dígitos. Em dinheiro, reserva tudo e espera o caixa confirmar. Pix: QR Code dinâmico com prazo, reserva até o banco confirmar (webhook), expiração, idempotência e conciliação de confirmação atrasada (ver [Pix](#pix-com-conexão-instável)) | O gateway ([MockPagamentoGateway](apps/api/src/integrations/gateway-pagamento/mock-gateway.ts)) aprova cartão/vale na hora e "paga" o Pix sozinho depois de alguns segundos — não existe adquirente real |
| Comprovante | NFC-e emitida na aprovação do pagamento e mostrada na tela com o QR Code; erro fiscal registrado sem travar o pedido; envio por e-mail/SMS; reenvio e reemissão pelo balcão | A nota é fictícia ([MockEmissorFiscal](apps/api/src/integrations/api-fiscal/mock-emissor-fiscal.ts): número, chave de 44 dígitos e URL de consulta de homologação); o **e-mail é enviado de verdade** quando há SMTP configurado ([SmtpServicoNotificacao](apps/api/src/integrations/notificacao/smtp-notificacao.ts)); sem SMTP, e **sempre no SMS**, o envio só é registrado no log da API, sem o contato ([MockServicoNotificacao](apps/api/src/integrations/notificacao/mock-notificacao.ts)) |
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
| 4 — Pagamento | "Para comer aqui" ou "Para levar", CPF na nota (com cadastro na fidelidade: "Incluir o mesmo CPF?", outro CPF ou nenhum) e a forma de pagamento. Pix: QR Code, valor e tempo para expirar; QR expirado gera outro com o carrinho intacto |
| 5 — Nota e comprovante | Número do pedido, a NFC-e autorizada com o QR Code de consulta (e o CPF mascarado, se informado), pontos acumulados e, como extra, o comprovante por e-mail/SMS. Erro fiscal: o pedido aparece concluído, com o número, e a loja reemite a nota. Em dinheiro: "Pague no caixa" com o número do pedido; a nota sai impressa no caixa |

O totem parado na Tela 0 se recarrega sozinho quando o servidor reinicia, para pegar o que o Administrador mudou. Um cliente no meio do pedido não é interrompido.

## Área restrita: Administrador e Funcionário

Fica em `http://localhost:5173/admin` (mesmo endereço do totem, com `/admin`). O PIN digitado define o modo: `ADMIN_PIN` entra como Administrador e `FUNCIONARIO_PIN` como Funcionário (sem as variáveis, `1234` e `0000`, e a API avisa no log). No PowerShell: `$env:ADMIN_PIN = '482913'; $env:FUNCIONARIO_PIN = '716204'; npm run dev:api`. É uma trava simples, não um login com usuários.

- **O PIN só vai na entrada**, que abre uma sessão; as demais chamadas levam o token dela (`x-sessao`), não o PIN.
- **5 PINs errados seguidos bloqueiam a entrada** daquele endereço por 5 minutos (`ACESSO_BLOQUEIO_MINUTOS`); a tela diz quantas tentativas restam. Um acerto zera a contagem.
- **30 minutos sem uso encerram a sessão** (`SESSAO_INATIVA_MINUTOS`), no navegador e na API, e a tela volta ao PIN. A atualização automática da lista de pedidos não conta como uso.

| Modo | Quando vale | O que muda |
|---|---|---|
| Administrador | **Preço, foto, descrição, quantidade e disponibilidade dos produtos: na hora** (como no modo Funcionário). **O resto, quando o servidor reiniciar:** fica pendente (selo "pendente" em cada item e uma faixa com o resumo, com "Descartar pendências") | Tudo: aparência, cardápio, combos, fidelidade, pagamento, cupons, endereço dos termos; vê o relatório de vendas. Pode alternar para o modo Funcionário |
| Funcionário | **Na hora** (os totens veem em até 30 segundos; a API já cobra o preço novo) | Marca item como esgotado (sem remover), troca preço, quantidade à venda, foto e descrição; recebe ou cancela pedidos em dinheiro no caixa; confirma a entrega no balcão; consulta pedidos, reenvia comprovantes e reemite notas que falharam |

Abas do Administrador:

| Aba | O que define |
|---|---|
| Vendas | Relatório de vendas (US 25): faturamento, pedidos, ticket médio e itens vendidos; faturamento por hora, dia ou mês; mais vendidos (por unidades ou por faturamento); faturamento por categoria e por forma de pagamento; parte dos pedidos para comer aqui e para levar. Filtros de período, categoria, forma de pagamento e consumo, e cada gráfico também em tabela. Só leitura |
| Aparência | Nome e frase, logotipo (emoji ou imagem), cores (as demais calculadas por contraste), nome e descrição de cada tela, publicidade da Tela 0 (até 10 imagens de pé e segundos por imagem), fontes (salvas, ainda sem efeito) |
| Cardápio | Categorias (nome, ícone em emoji ou imagem, foto de capa), ordem por arrastar e soltar e ativar/desativar — **estes dois valem na hora** —, posição das categorias (topo, esquerda ou direita), aba "Todos", produtos e combos |
| Fidelidade | Programa ligado ou desligado, acúmulo e seu percentual, quantos pontos valem R$ 1,00, se pontos somam com cupom; clientes por CPF (cadastro vale na hora) e o QR Code do cartão de cada um |
| Pagamento | Crédito, débito, Pix, vale-refeição, vale-alimentação e dinheiro, cada um ligado ou desligado (pelo menos um); "Para comer aqui" e "Para levar" (pelo menos um) |
| Cartões NFC | Estado do leitor NFC, cadastro de cartões travados (escolhe o item e aproxima o cartão) e a lista dos cadastrados. Vale na hora. Ver [Leitor NFC](#leitor-nfc-celular-por-usb-c) |
| Cupons | Aceitar cupons ou não; cada cupom com desconto, validade, usos, para que vale (pedido inteiro, alguns itens ou algumas categorias), pedido mínimo e teto do percentual; QR Code de cada cupom |
| Privacidade | Endereço público dos Termos e Condições (o QR Code do totem leva a ele), o termo exibido e a auditoria do consentimento |

Regras que valem a pena saber:

- **Relatório de vendas:** uma venda conta quando o pagamento é aprovado (em dinheiro, quando o caixa confirma; pedido cancelado no caixa não conta). O faturamento é o que entrou, depois dos descontos; por produto e por categoria, o desconto de cada pedido é dividido entre os itens, e o de um cupom restrito cai só nos itens que ele alcança. Dias e horas seguem o horário de Brasília. O histórico não guarda dado pessoal (nem CPF, nem cliente) e começa a contar a partir desta versão.
- **Categorias: ordem e ativação valem na hora** (os totens veem em até 30 segundos). Desativar uma categoria que tem itens pede confirmação explícita (a API recusa sem ela): os itens somem dos totens e não podem ser comprados, sem nada ser apagado. Pelo menos uma categoria fica ativa.
- **Cupom: datas coerentes.** O fim da validade precisa ser depois do início e não pode estar no passado (editar outro campo de um cupom já vencido continua possível); código repetido é recusado.
- **Consulta de pedidos** (modo Funcionário, aba "Consulta de pedidos"): pedidos que chegaram ao pagamento, filtrados por período, situação da nota (autorizada, falha, pendente, sem nota) e forma de pagamento. CPF e contatos chegam do servidor já mascarados (`***.456.789-**`, `jo***@gm***.com`, `(11) *****-4321`). O comprovante pode ser reenviado para o mesmo contato ou para um novo que o cliente informe no balcão — esse exige marcar que o cliente autorizou, e a autorização entra na auditoria do consentimento (origem "balcão").
- **Esgotado vale na hora**, mesmo antes de a tela dos totens se atualizar: a API recusa adicionar o item e recusa pagar um carrinho que já o tinha.
- **Quantidade à venda** é opcional. Com ela, o item esgota sozinho quando as unidades acabam (a baixa acontece no pagamento) e o carrinho não passa do que resta.
- **Combo** junta itens já cadastrados, cada um com sua quantidade, por um preço próprio. Não tem quantidade própria: esgota assim que qualquer item dele acaba, e o estoque é conferido somando o que o carrinho inteiro usa de cada item. Um item que está num combo não pode ser removido (nem virar combo) antes de sair dele.
- **Cupom precisa dar desconto** (US 36): zero, negativo ou mais de 100% é recusado ao salvar. Um cupom assim gravado por fora da área restrita aparece como "Valor inválido" e o totem não o aceita.
- **Cupom com regras**: só para alguns itens ou categorias (o desconto é calculado só sobre eles), a partir de um valor de pedido e, no percentual, com teto (ex.: 10% limitado a R$ 50,00). Se o carrinho deixa de cumprir a regra, o cupom sai sozinho e o carrinho avisa por quê.
- **Pontos de fidelidade como desconto**: o desconto é proporcional (`pontosPorReal`) e nunca passa do valor do pedido; pedir mais pontos do que o saldo é recusado com o saldo na mensagem. Os pontos saem do saldo quando o pagamento começa (QR Pix na tela, pedido no caixa ou cartão aprovado); se o Pix expira ou é cancelado, ou o caixa cancela, eles voltam e os pontos que o pedido renderia não entram.
- **Dinheiro**: o totem não recebe cédulas. O pedido vai para o caixa com o número de três dígitos, estoque, cupom e pontos reservados. O funcionário confere o CPF da nota (mascarado), recebe e a nota é emitida para impressão; os pontos entram nessa hora. Cancelar devolve tudo.
- **Vale-refeição e vale-alimentação** são formas de pagamento próprias (códigos 11 e 10 na NFC-e), não crédito nem débito, e precisam ser habilitados na credenciadora. Pela Lei 14.442/2022 o vale-alimentação é para gêneros alimentícios (mercados), por isso vem desligado.
- **O totem não cadastra clientes de fidelidade.** Um CPF válido que não está na lista é avisado de que não tem cadastro e segue sem fidelidade.
- **Os dados ficam em `apps/api/data`** (`estado.json`, `rascunho.json` com as pendências, `vendas.jsonl` com o histórico de vendas, `imagens/` e `auditoria-consentimento.jsonl`), fora do git. Apagar a pasta devolve o totem à configuração de fábrica — e apaga a auditoria e o histórico de vendas.

## Pix com conexão instável

O cliente paga por Pix sem perder o pedido nem ser cobrado duas vezes:

- **QR Code dinâmico:** vale só para aquele pedido e valor, por 5 minutos (`PIX_EXPIRACAO_SEGUNDOS`). A tela mostra o QR, o valor e a contagem regressiva. Enquanto o QR está na tela, estoque, cupom, pontos e número do pedido ficam reservados, e o carrinho não muda.
- **Confirmação pelo webhook:** o banco avisa em `POST /pagamento/pix/webhook` (com o segredo `PIX_WEBHOOK_TOKEN` no cabeçalho `x-webhook-token`); a API confere o status no banco antes de aceitar e o pedido segue para a nota. O totem pergunta a cada 2,5 s; a API também consulta o banco de tempos em tempos, caso um aviso se perca.
- **QR expirado:** a reserva é desfeita, a cobrança é cancelada no banco e o totem avisa e oferece um QR novo, com o carrinho intacto.
- **Tempo esgotado:** se o banco não responde (`PIX_TEMPO_LIMITE_MS`), o totem avisa da instabilidade e o carrinho continua como estava.
- **Reconexão sem cobrança dupla:** a cobrança é criada com chave de idempotência (pedido + tentativa + valor). Tentar de novo depois de uma queda devolve o mesmo QR, nunca um segundo. Com o QR na tela e a rede caindo, o QR e o prazo continuam, e um pagamento feito nesse meio-tempo é reconhecido ao reconectar.
- **Confirmação atrasada:** se o banco confirma um QR que já tinha expirado, a API concilia: o pedido (se o valor ainda é o mesmo) vira pago com aquele pagamento, sem gerar outro; se outro QR estava na tela, ele é cancelado. Se o cliente acabou pagando dois QR, ou o carrinho mudou depois, o pagamento excedente é estornado. Esses pedidos aparecem marcados na consulta de pedidos.

## Comprovante por e-mail e SMS

- **E-mail:** com `SMTP_HOST` definido (no `infra/.env`), o comprovante sai de verdade (itens, descontos, total, forma de pagamento e o link da NFC-e). No Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORTA=587`, `SMTP_USUARIO` = o endereço e `SMTP_SENHA` = uma [senha de app](https://myaccount.google.com/apppasswords) (exige verificação em duas etapas). A API diz no log, ao iniciar, se o e-mail é real ou simulado.
- **SMS:** ainda simulado (registrado no log da API). Um provedor real (Twilio, Zenvia...) entra como outro adapter de [ServicoNotificacao](apps/api/src/integrations/notificacao/ServicoNotificacao.ts), sem mudar o resto.
- **Validação na tela:** o e-mail é conferido pela sintaxe e o celular pelo DDD e pelo nono dígito antes do envio; o erro aparece na hora e o campo fica para corrigir. A API confere de novo.
- **SMS** leva o link direto da nota (o QR Code de consulta).
- **Falha no envio** (provedor recusou, fora do ar ou demorou): o totem avisa e oferece tentar de novo, mandar pelo outro canal ou seguir; se os dois canais falham, o cliente segue com o número do pedido na tela. A falha fica registrada e aparece na consulta de pedidos, de onde o balcão reenvia.
- O teclado do totem ganhou as teclas de e-mail (`@`, `.`, `_`, `-`, `.com`, `.com.br`, `@gmail.com`).

### Simulando Pix e NFC-e

Com os mocks, o "cliente paga" o Pix sozinho 10 segundos depois de o QR aparecer. Para testar os outros casos, antes de `npm run dev:api`:

| Para ver | Variável |
|---|---|
| QR expirar | `MOCK_PIX_PAGAR_APOS_SEGUNDOS=nunca` (e `PIX_EXPIRACAO_SEGUNDOS=30` para não esperar 5 minutos) |
| Confirmação atrasada | Com o QR expirado, `POST /pagamento/pix/simulador/<transacaoId>/pagar` (só existe com o gateway mock e fora de produção) |
| Aviso de instabilidade | `MOCK_PIX_ATRASO_MS=15000` (acima do `PIX_TEMPO_LIMITE_MS`) |
| Erro fiscal | `MOCK_FISCAL_FALHA=sempre` (ou uma chance, como `0.3`) |
| Falha no envio do comprovante | `MOCK_NOTIFICACAO_FALHA=email`, `sms` ou `sempre` (os dois canais) |

## Leitor NFC (celular por USB-C)

Módulo opcional: com um celular Android ligado ao notebook pelo cabo USB-C, o cliente aproxima um cartão NFC e o item dele entra no carrinho do totem (no cardápio ou no carrinho; nas outras telas, o totem orienta). Enquanto o leitor está ligado, o cabeçalho do totem mostra **📶 NFC**; sem ele, nada muda.

**Modo híbrido** — o cartão diz o item de dois jeitos, nesta ordem:
1. **Código gravado no cartão** (registro de texto `totem-item:<id do item>`), gravado pela página do leitor no modo "Gravar cartão". Regravável à vontade: o cartão que era suco vira sorvete.
2. **Número de série cadastrado** na área restrita (aba Cartões NFC), para cartões que não aceitam gravação — como cartões de evento, que vêm com senhas próprias.

Cartão desconhecido só gera um aviso; o número de série dele não é guardado (pode ser um cartão do cliente). O mesmo cartão encostado de novo em 2 segundos conta uma vez só. Para comprar cartões, prefira **NTAG213/215/216**: funcionam em quase todo celular e aceitam gravação; MIFARE Classic nem é lido por muitos celulares.

**Para ligar:**
1. No celular (uma vez): *Configurações → Sobre o telefone → Informações do software*, tocar 7 vezes em "Número de compilação"; depois *Opções do desenvolvedor → Depuração USB* ligada; NFC ligado.
2. Ligar o celular no notebook pelo cabo e aceitar "Permitir depuração USB".
3. Com `npm run dev:api` e `npm run dev:totem` rodando: `npm run nfc:conectar`. O comando acha o `adb`, faz o `localhost` do celular apontar para o notebook (portas 5173 e 3333) e abre `http://localhost:5173/leitor-nfc` no Chrome do celular.
4. No celular, tocar em **Ativar leitor**. A página precisa ficar aberta, na frente (ela mantém a tela ligada).

A API só aceita leituras que chegam pelo cabo (do próprio notebook): ninguém na rede da loja consegue pôr itens no carrinho. A leitura usa a Web NFC do Chrome, que exige o endereço `localhost` (seguro) — por isso o `adb reverse`, e não o IP do notebook.

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
| **Intermediário** | Futuro — parcial | Impressora térmica (não implementada); **leitor NFC** (celular ligado por USB-C, ver [Leitor NFC](#leitor-nfc-celular-por-usb-c)); leitor de QR/código de barras (cupom por QR Code ou código de barras e o QR do cartão de fidelidade já são lidos pela câmera do totem, em software; imagens de teste em [docs/cupons-de-teste](docs/cupons-de-teste)) |
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
| — | US 25 Relatório de vendas e mais vendidos | [Admin](apps/totem/src/screens/Admin) (aba Vendas) | [relatorio](apps/api/src/modules/relatorio) |
| — | Consulta de pedidos e reenvio de comprovante | [Admin](apps/totem/src/screens/Admin) (aba Consulta de pedidos) | [funcionario](apps/api/src/modules/funcionario) e [comprovante](apps/api/src/modules/comprovante) |
| — | US 11 Pix com tratamento de instabilidade | [Pagamento](apps/totem/src/screens/Pagamento) | [pagamento](apps/api/src/modules/pagamento) |
| — | US 15 NFC-e na tela | [Comprovante](apps/totem/src/screens/Comprovante) | [comprovante](apps/api/src/modules/comprovante) (via [api-fiscal](apps/api/src/integrations/api-fiscal)) |
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
