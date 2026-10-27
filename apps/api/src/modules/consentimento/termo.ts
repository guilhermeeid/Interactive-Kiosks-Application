import type { FinalidadeConsentimento, TermoConsentimento } from '@totem/shared';
import { config } from '../../db/memory-store';

// Versão do termo de consentimento exibido no totem. Mudou qualquer texto de
// `obterTermo`? Aumente a versão: a auditoria registra diante de qual versão cada
// cliente decidiu.
// 1.1: inclui os Termos e Condições completos (link e QR Code no totem).
export const VERSAO_TERMO = '1.1';

export const FINALIDADES: FinalidadeConsentimento[] = ['cpf_nota', 'fidelidade', 'comprovante'];

// US 29: aviso de finalidades mostrado antes de qualquer dado pessoal ser guardado, e os
// Termos e Condições completos. Texto-base: precisa de revisão jurídica do
// estabelecimento antes do uso real.
export function obterTermo(): TermoConsentimento {
  const loja = config.aparencia.nomeEstabelecimento;
  return {
    versao: VERSAO_TERMO,
    aviso:
      `${loja} só guarda seus dados pessoais para as finalidades que você marcar. Nada é ` +
      'obrigatório: você pode concluir o pedido sem informar nenhum dado.',
    finalidades: {
      cpf_nota: 'Concordo em usar meu CPF na nota fiscal deste pedido.',
      fidelidade:
        'Concordo em usar meu CPF no programa de fidelidade, para consultar meu saldo, ' +
        'usar e acumular pontos.',
      comprovante:
        'Concordo em usar meu e-mail ou telefone para receber o comprovante deste pedido.',
    },
    secoes: [
      {
        titulo: 'Quem cuida dos seus dados',
        paragrafos: [
          `${loja}, que opera este totem de autoatendimento, é quem decide como os dados ` +
            'informados aqui são usados (controlador, na Lei Geral de Proteção de Dados — LGPD, ' +
            'Lei 13.709/2018).',
        ],
      },
      {
        titulo: 'Quais dados, e para quê',
        paragrafos: [
          'CPF na nota fiscal: para emitir a nota deste pedido com a sua identificação.',
          'CPF no programa de fidelidade: para localizar o seu cadastro, mostrar o saldo e ' +
            'usar e acumular pontos neste pedido.',
          'E-mail ou telefone: só para enviar o comprovante deste pedido.',
          'Cada uso tem a sua própria caixa de seleção. O totem só pede o dado depois que ' +
            'você marca a caixa da finalidade correspondente.',
        ],
      },
      {
        titulo: 'Com base em quê',
        paragrafos: [
          'No seu consentimento (art. 7º, I, da LGPD), dado ao marcar cada caixa. Se você não ' +
            'marcar, o pedido segue normalmente, sem o dado.',
        ],
      },
      {
        titulo: 'O que não fazemos',
        paragrafos: [
          'Não vendemos nem cedemos seus dados, e não os usamos para propaganda.',
          'O totem nunca pede nem guarda dados de cartão: o pagamento é feito no terminal da ' +
            'operadora.',
        ],
      },
      {
        titulo: 'Por quanto tempo',
        paragrafos: [
          'O CPF na nota fica na nota fiscal, guardada pelo prazo que a legislação fiscal exige.',
          'O e-mail ou telefone é usado apenas para o envio do comprovante deste pedido.',
          'O cadastro de fidelidade fica guardado enquanto você participar do programa.',
        ],
      },
      {
        titulo: 'Seus direitos',
        paragrafos: [
          'Você pode pedir a confirmação e o acesso aos seus dados, a correção, a eliminação ' +
            'e informações sobre com quem foram compartilhados, e pode revogar o consentimento ' +
            '(art. 18 da LGPD). Peça no atendimento da loja.',
          'Neste pedido, você pode voltar atrás desmarcando a caixa antes de concluir a etapa.',
        ],
      },
      {
        titulo: 'Registro do consentimento',
        paragrafos: [
          'Cada decisão (concordar ou recusar) é registrada com data, hora, versão deste termo ' +
            `e finalidade, sem o dado em si. Versão do termo: ${VERSAO_TERMO}.`,
        ],
      },
    ],
  };
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Página pública com os Termos e Condições, aberta no celular pelo QR Code do totem.
export function paginaTermos(): string {
  const termo = obterTermo();
  const loja = escaparHtml(config.aparencia.nomeEstabelecimento);
  const secoes = termo.secoes
    .map(
      (secao) =>
        `<h2>${escaparHtml(secao.titulo)}</h2>` +
        secao.paragrafos.map((paragrafo) => `<p>${escaparHtml(paragrafo)}</p>`).join(''),
    )
    .join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Termos e Condições — ${loja}</title>
<style>
  body { margin: 0; padding: 1.5rem; font-family: system-ui, sans-serif; line-height: 1.55;
         color: #3b2418; background: #fff6e9; }
  main { max-width: 42rem; margin: 0 auto; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.1rem; margin-top: 1.6rem; }
  small { color: #7a5c4b; }
</style>
</head>
<body><main>
<h1>Termos e Condições — ${loja}</h1>
<small>Versão ${escaparHtml(termo.versao)}</small>
${secoes}
</main></body>
</html>`;
}
