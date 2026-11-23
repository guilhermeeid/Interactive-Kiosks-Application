import { randomUUID } from 'node:crypto';
import type { Comprovante, DestinoComprovante, Pedido } from '@totem/shared';
import type { EmissorFiscal } from '../../integrations/api-fiscal';
import type { ServicoNotificacao } from '../../integrations/notificacao';
import { emissorFiscal as emissorPadrao } from '../../integrations/instancias';
import { loadEnv } from '../../config/env';
import {
  comprovantes,
  obterOuCriarPedido,
  pedidos,
  persistir,
  registrarAuditoriaConsentimento,
} from '../../db/memory-store';
import { HttpError } from '../../errors';
import { ErroTempoEsgotado, comTempoLimite } from '../../tempo-limite';
import { exigirConsentimento } from '../consentimento/consentimento.service';
import { VERSAO_TERMO } from '../consentimento/termo';
import type {
  DispensarComprovanteBody,
  EnviarComprovanteBody,
  ReenviarComprovanteBody,
} from './comprovante.types';
import { celularValido, emailValido } from './contato';
import { mascararCpf, mascararEmail, mascararTelefone } from './mascara';
import { montarMensagem } from './mensagem';

const NOME_CANAL = { email: 'e-mail', sms: 'SMS' } as const;

function pedidoPago(pedido: Pedido): boolean {
  return pedido.status === 'pago' || pedido.status === 'finalizado';
}

// US 15: emite a NFC-e do pedido assim que o pagamento é aprovado (no terminal, no Pix
// ou no caixa). US 09: o CPF que o cliente informou (e consentiu em usar na nota) vai
// para o emissor; sem CPF, a nota sai sem identificação do consumidor.
// Erro fiscal (rejeição, provedor fora do ar, tempo esgotado) não impede o pedido: a
// falha fica registrada no comprovante — visível na consulta de pedidos, onde a emissão
// pode ser refeita — e no log do servidor. Nunca lança erro.
// Um pedido só tem uma nota: chamar de novo com a nota autorizada não emite outra.
export async function emitirNotaDoPedido(
  pedido: Pedido,
  emissor: EmissorFiscal = emissorPadrao,
): Promise<Comprovante> {
  const comprovante = comprovantes.get(pedido.id) ?? { pedidoId: pedido.id };
  if (comprovante.nota?.status === 'autorizada') {
    return comprovante;
  }
  const tentativas = (comprovante.nota?.tentativas ?? 0) + 1;
  const ultimaTentativaEm = new Date().toISOString();
  try {
    const nota = await comTempoLimite(
      emissor.emitirNotaFiscal({ pedido, cpfNaNota: pedido.cpfNaNota }),
      loadEnv().fiscalTempoLimiteMs,
      'O emissor da NFC-e não respondeu a tempo',
    );
    comprovante.nota = {
      status: 'autorizada',
      numero: nota.numero,
      serie: nota.serie,
      chaveAcesso: nota.chaveAcesso,
      urlConsulta: nota.urlConsulta,
      urlDanfe: nota.urlDanfe,
      tentativas,
      ultimaTentativaEm,
      autorizadaEm: nota.emitidaEm,
    };
    comprovante.notaFiscalUrl = nota.urlDanfe;
    comprovante.cpfNaNotaMascarado = nota.cpfDestinatario
      ? mascararCpf(nota.cpfDestinatario)
      : undefined;
  } catch (err) {
    const erro = (err as Error)?.message || 'Falha desconhecida na emissão da NFC-e';
    comprovante.nota = { status: 'falha', erro, tentativas, ultimaTentativaEm };
    console.error(
      `[fiscal] Falha ao emitir a NFC-e do pedido ${pedido.numero ?? pedido.id} ` +
        `(tentativa ${tentativas}): ${erro}`,
    );
  }
  comprovantes.set(pedido.id, comprovante);
  persistir();
  return comprovante;
}

// Marca o pedido pago como finalizado (o cliente saiu da tela de conclusão). A nota já
// foi emitida na aprovação do pagamento; se por algum motivo não foi, é emitida aqui.
async function finalizarPedido(pedido: Pedido, emissor: EmissorFiscal): Promise<Comprovante> {
  if (!pedidoPago(pedido)) {
    throw new HttpError(409, 'O pedido ainda não foi pago');
  }
  const comprovante = comprovantes.get(pedido.id)?.nota
    ? (comprovantes.get(pedido.id) as Comprovante)
    : await emitirNotaDoPedido(pedido, emissor);
  if (pedido.status === 'pago') {
    pedido.status = 'finalizado';
    persistir();
  }
  return comprovante;
}

// Contato inválido: 400, com a mensagem que diz o que corrigir (o totem já confere antes,
// mas o servidor nunca confia na tela).
function montarDestino(body: Partial<Pick<EnviarComprovanteBody, 'canal' | 'email' | 'telefone'>>) {
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const telefone = typeof body?.telefone === 'string' ? body.telefone.replace(/\D/g, '') : '';
  if (body?.canal === 'email') {
    if (!emailValido(email)) {
      throw new HttpError(400, 'E-mail inválido. Confira o endereço (ex.: nome@exemplo.com).');
    }
    return { canal: 'email', email } satisfies DestinoComprovante;
  }
  if (body?.canal === 'sms') {
    if (!celularValido(telefone)) {
      throw new HttpError(
        400,
        'Número inválido. Informe o DDD e o celular com 9 dígitos (ex.: 11 98765-4321).',
      );
    }
    return { canal: 'sms', telefone } satisfies DestinoComprovante;
  }
  throw new HttpError(400, 'Escolha e-mail ou SMS para o comprovante');
}

// Envia o comprovante (com o link da NFC-e, se autorizada) e guarda o destino, para um
// reenvio pedido no balcão. Se o provedor falha ou não responde, a falha fica registrada
// e a resposta é 502 com o código FALHA_ENVIO: o totem avisa e oferece tentar de novo,
// outro canal ou seguir sem comprovante. O pedido em si não é afetado.
async function enviarPara(
  pedido: Pedido,
  comprovante: Comprovante,
  destino: DestinoComprovante,
  servicoNotificacao: ServicoNotificacao,
): Promise<Comprovante> {
  // Guardado antes do envio: o contato foi consentido e serve para um reenvio no balcão.
  comprovante.destino = destino;
  try {
    await comTempoLimite(
      servicoNotificacao.enviarComprovante({
        destino,
        notaFiscalUrl: comprovante.nota?.urlConsulta ?? comprovante.notaFiscalUrl,
        mensagem: montarMensagem(pedido, comprovante),
      }),
      loadEnv().notificacaoTempoLimiteMs,
      'O provedor não respondeu a tempo',
    );
  } catch (err) {
    const erro =
      err instanceof ErroTempoEsgotado
        ? 'O provedor não respondeu a tempo'
        : (err as Error)?.message || 'Falha desconhecida no envio';
    comprovante.falhaEnvio = { canal: destino.canal, erro, em: new Date().toISOString() };
    comprovantes.set(pedido.id, comprovante);
    persistir();
    console.error(
      `[notificacao] Falha ao enviar o comprovante do pedido ${pedido.numero ?? pedido.id} ` +
        `por ${destino.canal}: ${erro}`,
    );
    throw new HttpError(
      502,
      `Não foi possível enviar o comprovante por ${NOME_CANAL[destino.canal]} agora.`,
      'FALHA_ENVIO',
    );
  }
  comprovante.enviadoEm = new Date().toISOString();
  comprovante.falhaEnvio = undefined;
  comprovantes.set(pedido.id, comprovante);
  persistir();
  return comprovante;
}

// O comprovante como o totem (tela pública) o vê: a nota, o CPF mascarado e só o canal
// do envio, nunca o e-mail ou telefone.
export function comprovanteParaTotem(comprovante: Comprovante): Comprovante {
  return {
    pedidoId: comprovante.pedidoId,
    nota: comprovante.nota,
    notaFiscalUrl: comprovante.notaFiscalUrl,
    cpfNaNotaMascarado: comprovante.cpfNaNotaMascarado,
    destino: comprovante.destino ? { canal: comprovante.destino.canal } : undefined,
    enviadoEm: comprovante.enviadoEm,
    falhaEnvio: comprovante.falhaEnvio,
  };
}

// US 15: a NFC-e do pedido, para a tela de conclusão mostrar o QR Code.
export async function obterComprovante(pedidoId: string): Promise<Comprovante> {
  const pedido = pedidos.get(pedidoId);
  const comprovante = comprovantes.get(pedidoId);
  if (!pedido || !pedidoPago(pedido) || !comprovante) {
    throw new HttpError(404, 'A nota deste pedido ainda não foi emitida');
  }
  return comprovanteParaTotem(comprovante);
}

// US-08: Receber comprovante por e-mail/SMS — a NFC-e já foi emitida na aprovação do
// pagamento; aqui o comprovante (com o link dela) segue para o e-mail ou o telefone.
// US 29: e-mail/telefone só são aceitos com o consentimento do cliente já registrado.
// LGPD: dado pessoal — exige consentimento/criptografia (email/telefone do body)
export async function enviarComprovante(
  body: EnviarComprovanteBody,
  emissorFiscal: EmissorFiscal,
  servicoNotificacao: ServicoNotificacao,
): Promise<Comprovante> {
  const pedido = obterOuCriarPedido(body.pedidoId);
  exigirConsentimento(pedido, 'comprovante');
  const destino = montarDestino(body);

  const comprovante = await finalizarPedido(pedido, emissorFiscal);
  return comprovanteParaTotem(await enviarPara(pedido, comprovante, destino, servicoNotificacao));
}

// Conclui o pedido sem enviar comprovante: a nota fiscal vale do mesmo jeito (QR Code
// na tela), mas nenhum e-mail ou telefone é pedido nem guardado. Usado quando o cliente
// recusa o consentimento (US 29) ou não quer o comprovante.
export async function dispensarComprovante(
  body: DispensarComprovanteBody,
  emissorFiscal: EmissorFiscal,
): Promise<Comprovante> {
  const comprovante = await finalizarPedido(obterOuCriarPedido(body.pedidoId), emissorFiscal);
  return comprovanteParaTotem(comprovante);
}

// ---------- Balcão: reemissão da nota e reenvio do comprovante ----------

function pedidoPagoPorId(pedidoId: string): Pedido {
  const pedido = pedidos.get(pedidoId);
  if (!pedido || !pedidoPago(pedido)) {
    throw new HttpError(404, 'Pedido pago não encontrado');
  }
  return pedido;
}

// Tenta de novo a NFC-e de um pedido cuja emissão falhou.
export async function reemitirNota(
  pedidoId: string,
  emissor: EmissorFiscal = emissorPadrao,
): Promise<Comprovante> {
  const pedido = pedidoPagoPorId(pedidoId);
  return comprovanteParaTotem(await emitirNotaDoPedido(pedido, emissor));
}

export function contatoMascarado(destino: DestinoComprovante): string {
  return destino.canal === 'email'
    ? mascararEmail(destino.email ?? '')
    : mascararTelefone(destino.telefone ?? '');
}

// Reenvio pedido pelo cliente no balcão: para o mesmo contato que recebeu o comprovante
// (o atendente só vê ele mascarado) ou para um contato novo que o cliente informa ali.
// Contato novo exige que o atendente confirme que o cliente autorizou o uso; essa
// autorização entra na auditoria do consentimento (origem "balcão").
// LGPD: dado pessoal — exige consentimento/criptografia (email/telefone do body)
export async function reenviarComprovante(
  pedidoId: string,
  body: ReenviarComprovanteBody,
  servicoNotificacao: ServicoNotificacao,
): Promise<{ canal: DestinoComprovante['canal']; contatoMascarado: string }> {
  const pedido = pedidoPagoPorId(pedidoId);
  const comprovante = comprovantes.get(pedido.id) ?? (await emitirNotaDoPedido(pedido));

  let destino: DestinoComprovante;
  if (body?.contatoOriginal === true) {
    if (!comprovante.destino) {
      throw new HttpError(400, 'Este pedido não tem contato salvo. Informe um contato novo.');
    }
    destino = comprovante.destino;
  } else {
    if (body?.autorizadoPeloCliente !== true) {
      throw new HttpError(
        400,
        'Confirme que o cliente pediu o reenvio e autorizou o uso deste contato',
      );
    }
    destino = montarDestino(body);
    registrarAuditoriaConsentimento({
      id: randomUUID(),
      pedidoId: pedido.id,
      finalidade: 'comprovante',
      aceito: true,
      versaoTermo: VERSAO_TERMO,
      registradoEm: new Date().toISOString(),
      origem: 'balcao',
    });
    pedido.consentimentos = { ...pedido.consentimentos, comprovante: true };
  }

  await enviarPara(pedido, comprovante, destino, servicoNotificacao);
  return { canal: destino.canal, contatoMascarado: contatoMascarado(destino) };
}
