import type { EnviarComprovanteParams, ServicoNotificacao } from './ServicoNotificacao';

// Implementação mock/stub de ServicoNotificacao, usada em desenvolvimento e testes
// enquanto o(s) provedor(es) real(is) de e-mail/SMS não são integrados.
// TODO: implementar adapter(s) real(is) (ex.: SES/SendGrid para e-mail, Twilio/Zenvia
// para SMS) atendendo a interface ServicoNotificacao, sem alterar
// apps/api/src/modules/comprovante (US-08).
export class MockServicoNotificacao implements ServicoNotificacao {
  async enviarComprovante(params: EnviarComprovanteParams): Promise<void> {
    // LGPD: dado pessoal — exige consentimento/criptografia (params.destino)
    // TODO: implementar envio real de e-mail/SMS.
    throw new Error('MockServicoNotificacao.enviarComprovante não implementado');
  }
}
