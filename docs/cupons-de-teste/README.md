# Cupons de teste (US 18)

Imagens para validar a leitura de cupom pela câmera do totem: abra no celular e mostre à webcam.

| Imagem | Conteúdo | O que deve acontecer |
|---|---|---|
| `1-qr-cupom-BEMVINDO10.png` | QR Code `TOTEM-CUPOM:BEMVINDO10` | Aplica 10% na hora |
| `2-barras-cupom-DESC5.png` | Código de barras Code 128 `DESC5` | Aplica R$ 5,00 na hora |
| `3-qr-cupom-INVALIDO.png` | QR Code `TOTEM-CUPOM:INVALIDO` | Aviso "Cupom INVALIDO expirado", com "Seguir sem o cupom" e "Ler outro código" |
| `4-barras-produto.png` | Código de barras EAN-13 de produto | Aviso de cupom inválido, com "Seguir sem o cupom" |
| `5-qr-site.png` | QR Code de um endereço da web | Aviso "Código não reconhecido", com "Seguir sem o cupom" |

Os cupons `BEMVINDO10`, `DESC5` e `INVALIDO` vêm nos dados de exemplo da instalação.

## Como testar

1. Rode `npm run dev:api` e `npm run dev:totem` e abra `http://localhost:5173` no Chrome do notebook. Permita o uso da câmera quando o navegador pedir.
2. Ponha um item no carrinho e toque em **📷 Ler cupom pela câmera** (no carrinho) ou em **📷 Câmera** (no cardápio).
3. No celular, aumente o brilho da tela e abra a imagem ocupando a tela toda. Para o código de barras, deite o celular na horizontal.
4. Segure o celular de 15 a 30 cm da webcam, com o código dentro da moldura. Se não ler, afaste um pouco: webcam de notebook costuma desfocar de muito perto.

O QR Code é lido com mais facilidade que o código de barras. Código de barras curto (como `DESC5`) lê melhor que um longo.
