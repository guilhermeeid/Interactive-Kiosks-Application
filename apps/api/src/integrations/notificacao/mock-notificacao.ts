import type { EnviarComprovanteParams, ServicoNotificacao } from './ServicoNotificacao';

// Implementação mock/stub de ServicoNotificacao: apenas loga no console em vez de
// enviar e-mail/SMS de verdade. Existe para o MVP rodar de ponta a ponta antes da
// integração real existir.
// TODO: implementar adapter(s) real(is) (ex.: SES/SendGrid para e-mail, Twilio/Zenvia
// para SMS) atendendo a interface ServicoNotificacao, sem alterar
// apps/api/src/modules/comprovante (US-08).
export class MockServicoNotificacao implements ServicoNotificacao {
  async enviarComprovante(params: EnviarComprovanteParams): Promise<void> {
    // LGPD: dado pessoal — exige consentimento/criptografia (params.destino)
    const alvo = params.destino.email ?? params.destino.telefone ?? 'destino desconhecido';
    console.log(`[mock-notificacao] Comprovante enviado por ${params.destino.canal} para ${alvo}`);
  }
}
