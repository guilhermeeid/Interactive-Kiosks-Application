import type { Comprovante } from '@totem/shared';
import type { EmissorFiscal } from '../../integrations/api-fiscal';
import type { ServicoNotificacao } from '../../integrations/notificacao';
import type { EnviarComprovanteBody } from './comprovante.types';

// TODO: implementar US-08 (Receber comprovante por e-mail/SMS) — orquestrar:
// 1) emissão fiscal via `emissorFiscal` (ver integrations/api-fiscal), usando o CPF
//    informado em US-05, se houver;
// 2) envio do comprovante via `servicoNotificacao` (ver integrations/notificacao).
// LGPD: dado pessoal — exige consentimento/criptografia (email/telefone do body)
export async function enviarComprovante(
  body: EnviarComprovanteBody,
  emissorFiscal: EmissorFiscal,
  servicoNotificacao: ServicoNotificacao,
): Promise<Comprovante> {
  throw new Error('enviarComprovante não implementado');
}
