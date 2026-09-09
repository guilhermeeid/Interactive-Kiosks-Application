import type { Comprovante, DestinoComprovante } from '@totem/shared';
import type { EmissorFiscal } from '../../integrations/api-fiscal';
import type { ServicoNotificacao } from '../../integrations/notificacao';
import { comprovantes, obterOuCriarPedido } from '../../db/memory-store';
import type { EnviarComprovanteBody } from './comprovante.types';

// US-08: Receber comprovante por e-mail/SMS — orquestra emissão fiscal (delegada a
// `emissorFiscal`) e envio da notificação (delegado a `servicoNotificacao`); ambas
// as dependências são injetadas para permitir trocar de provedor sem alterar este
// módulo (ver integrations/api-fiscal e integrations/notificacao).
// LGPD: dado pessoal — exige consentimento/criptografia (email/telefone do body)
export async function enviarComprovante(
  body: EnviarComprovanteBody,
  emissorFiscal: EmissorFiscal,
  servicoNotificacao: ServicoNotificacao,
): Promise<Comprovante> {
  const pedido = obterOuCriarPedido(body.pedidoId);

  const notaFiscal = await emissorFiscal.emitirNotaFiscal({
    pedido,
    cpfNaNota: pedido.cpfNaNota,
  });

  const destino: DestinoComprovante = {
    canal: body.canal,
    email: body.email,
    telefone: body.telefone,
  };
  await servicoNotificacao.enviarComprovante({ destino, notaFiscalUrl: notaFiscal.urlDanfe });

  const comprovante: Comprovante = {
    pedidoId: pedido.id,
    destino,
    notaFiscalUrl: notaFiscal.urlDanfe,
    enviadoEm: new Date().toISOString(),
  };
  comprovantes.set(pedido.id, comprovante);
  pedido.status = 'finalizado';

  return comprovante;
}
