import type { Comprovante, DestinoComprovante, Pedido } from '@totem/shared';
import type { EmissorFiscal } from '../../integrations/api-fiscal';
import type { ServicoNotificacao } from '../../integrations/notificacao';
import { comprovantes, obterOuCriarPedido } from '../../db/memory-store';
import { HttpError } from '../../errors';
import { exigirConsentimento } from '../consentimento/consentimento.service';
import type { DispensarComprovanteBody, EnviarComprovanteBody } from './comprovante.types';

// Só o miolo do CPF aparece na tela do totem, que é pública: ***.456.789-**
function mascararCpf(cpf: string): string {
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

// Emite a nota fiscal do pedido pago e o marca como finalizado. US 09: o CPF que o
// cliente informou (e consentiu em usar na nota) segue para o emissor fiscal; sem CPF, a
// nota sai sem identificação do consumidor. Um pedido só tem uma nota: chamadas
// repetidas devolvem a que já foi emitida.
async function finalizarPedido(pedido: Pedido, emissorFiscal: EmissorFiscal): Promise<Comprovante> {
  const existente = comprovantes.get(pedido.id);
  if (existente) {
    return existente;
  }
  if (pedido.status !== 'pago') {
    throw new HttpError(409, 'O pedido ainda não foi pago');
  }

  const notaFiscal = await emissorFiscal.emitirNotaFiscal({
    pedido,
    cpfNaNota: pedido.cpfNaNota,
  });
  const comprovante: Comprovante = {
    pedidoId: pedido.id,
    notaFiscalUrl: notaFiscal.urlDanfe,
    cpfNaNotaMascarado: notaFiscal.cpfDestinatario
      ? mascararCpf(notaFiscal.cpfDestinatario)
      : undefined,
  };
  comprovantes.set(pedido.id, comprovante);
  pedido.status = 'finalizado';
  return comprovante;
}

function montarDestino(body: EnviarComprovanteBody): DestinoComprovante {
  const email = body.email?.trim();
  const telefone = body.telefone?.trim();
  if (body.canal === 'email' && email) {
    return { canal: 'email', email };
  }
  if (body.canal === 'sms' && telefone) {
    return { canal: 'sms', telefone };
  }
  throw new HttpError(400, 'Informe o e-mail ou o telefone para receber o comprovante');
}

// US-08: Receber comprovante por e-mail/SMS — orquestra emissão fiscal (delegada a
// `emissorFiscal`) e envio da notificação (delegado a `servicoNotificacao`); ambas
// as dependências são injetadas para permitir trocar de provedor sem alterar este
// módulo (ver integrations/api-fiscal e integrations/notificacao).
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
  await servicoNotificacao.enviarComprovante({
    destino,
    notaFiscalUrl: comprovante.notaFiscalUrl,
  });
  comprovante.destino = destino;
  comprovante.enviadoEm = new Date().toISOString();

  return comprovante;
}

// Conclui o pedido sem enviar comprovante: a nota fiscal é emitida do mesmo jeito, mas
// nenhum e-mail ou telefone é pedido nem guardado. Usado quando o cliente recusa o
// consentimento (US 29) ou pulou a identificação (US 10).
export async function dispensarComprovante(
  body: DispensarComprovanteBody,
  emissorFiscal: EmissorFiscal,
): Promise<Comprovante> {
  return finalizarPedido(obterOuCriarPedido(body.pedidoId), emissorFiscal);
}
