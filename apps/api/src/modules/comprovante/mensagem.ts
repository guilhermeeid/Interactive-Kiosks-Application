import type { Comprovante, FormaPagamento, Pedido } from '@totem/shared';
import { config } from '../../db/memory-store';
import type { MensagemComprovante } from '../../integrations/notificacao';

const NOME_FORMA: Record<FormaPagamento, string> = {
  credito: 'Crédito',
  debito: 'Débito',
  pix: 'Pix',
  vale_refeicao: 'Vale-refeição',
  vale_alimentacao: 'Vale-alimentação',
  dinheiro: 'Dinheiro',
};

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// O comprovante da compra: loja, número, itens, descontos, total, forma de pagamento e o
// link da NFC-e (ou o aviso de que ela será emitida). No SMS, só o essencial e o link
// direto da nota. Nomes de produto vêm do cadastro e são escapados no HTML.
export function montarMensagem(pedido: Pedido, comprovante: Comprovante): MensagemComprovante {
  const loja = config.aparencia.nomeEstabelecimento;
  const numero = pedido.numero ?? pedido.id.slice(0, 8);
  const data = new Date(pedido.pagoEm ?? pedido.criadoEm).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const forma = pedido.formaPagamento ? NOME_FORMA[pedido.formaPagamento] : '';
  const linkNota =
    comprovante.nota?.status === 'autorizada' ? comprovante.nota.urlConsulta : undefined;

  const linhas = pedido.itens.map(
    (item) =>
      `${item.quantidade}× ${item.nome} — ${reais(item.precoUnitarioCentavos * item.quantidade)}`,
  );
  const descontos = [
    pedido.descontoCupomCentavos > 0 &&
      `Cupom ${pedido.cupomAplicado ?? ''}: -${reais(pedido.descontoCupomCentavos)}`,
    pedido.descontoPontosCentavos > 0 && `Pontos: -${reais(pedido.descontoPontosCentavos)}`,
  ].filter((linha): linha is string => Boolean(linha));
  const sobreNota = linkNota
    ? `Nota fiscal (NFC-e nº ${comprovante.nota?.numero}): ${linkNota}`
    : 'A nota fiscal será emitida pela loja; se precisar, peça no balcão com o número do pedido.';

  const texto = [
    `${loja} — comprovante do pedido nº ${numero}`,
    data,
    '',
    ...linhas,
    ...descontos,
    `Total: ${reais(pedido.valorAPagarCentavos)}${forma ? ` (${forma})` : ''}`,
    '',
    sobreNota,
  ].join('\n');

  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#3b2418">
<h2 style="margin:0">${escaparHtml(loja)}</h2>
<p>Comprovante do pedido <strong>nº ${escaparHtml(numero)}</strong> · ${escaparHtml(data)}</p>
<ul>${linhas.map((linha) => `<li>${escaparHtml(linha)}</li>`).join('')}</ul>
${descontos.map((linha) => `<p style="margin:0">${escaparHtml(linha)}</p>`).join('')}
<p><strong>Total: ${escaparHtml(reais(pedido.valorAPagarCentavos))}</strong>${forma ? ` (${escaparHtml(forma)})` : ''}</p>
<p>${
    linkNota
      ? `<a href="${escaparHtml(linkNota)}">Consultar a nota fiscal (NFC-e nº ${escaparHtml(comprovante.nota?.numero ?? '')})</a>`
      : escaparHtml(sobreNota)
  }</p>
</body></html>`;

  const sms = linkNota
    ? `${loja}: pedido ${numero}, ${reais(pedido.valorAPagarCentavos)}. Nota fiscal: ${linkNota}`
    : `${loja}: pedido ${numero}, ${reais(pedido.valorAPagarCentavos)}. A nota fiscal sera emitida pela loja.`;

  return { assunto: `Comprovante do pedido nº ${numero} — ${loja}`, texto, html, sms };
}
