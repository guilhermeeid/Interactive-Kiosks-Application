import {
  ErroNotificacao,
  type EnviarComprovanteParams,
  type ServicoNotificacao,
} from './ServicoNotificacao';

// Simulação de falha, para testar no totem o aviso e a retentativa sem provedor real:
// MOCK_NOTIFICACAO_FALHA=sempre (os dois canais falham), email ou sms (só aquele canal)
// ou um número entre 0 e 1 (chance de falhar). Sem a variável, todo envio dá certo.
function deveFalhar(canal: 'email' | 'sms'): boolean {
  const config = process.env.MOCK_NOTIFICACAO_FALHA;
  if (!config) return false;
  if (config === 'sempre' || config === canal) return true;
  const chance = Number(config);
  return Number.isFinite(chance) && chance > 0 && Math.random() < chance;
}

// Implementação mock/stub de ServicoNotificacao: só registra no console (sem o contato,
// que é dado pessoal) em vez de enviar de verdade. Usada para o SMS e, sem SMTP
// configurado, também para o e-mail.
// TODO: adapter real de SMS (ex.: Twilio, Zenvia) atendendo a interface
// ServicoNotificacao, sem alterar apps/api/src/modules/comprovante.
export class MockServicoNotificacao implements ServicoNotificacao {
  async enviarComprovante(params: EnviarComprovanteParams): Promise<void> {
    const { canal } = params.destino;
    if (deveFalhar(canal)) {
      throw new ErroNotificacao(`Falha simulada no envio por ${canal} (MOCK_NOTIFICACAO_FALHA)`);
    }
    const conteudo = canal === 'sms' ? params.mensagem.sms : params.mensagem.assunto;
    console.log(`[mock-notificacao] Comprovante (simulado) por ${canal}: ${conteudo}`);
  }
}
