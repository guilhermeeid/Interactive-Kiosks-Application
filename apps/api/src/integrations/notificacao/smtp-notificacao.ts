import nodemailer, { type Transporter } from 'nodemailer';
import {
  ErroNotificacao,
  type EnviarComprovanteParams,
  type ServicoNotificacao,
} from './ServicoNotificacao';

export interface ConfigSmtp {
  host: string;
  porta: number;
  seguro: boolean; // TLS direto (porta 465); falso = STARTTLS (porta 587)
  usuario?: string;
  senha?: string;
  remetente: string; // ex.: "Lanchonete <comprovantes@exemplo.com>"
}

// E-mail de verdade por SMTP (Gmail com senha de app, Outlook, SendGrid, Amazon SES,
// Mailgun...). Só cuida do canal e-mail; o SMS vai para `sms` (hoje, o mock).
export class SmtpServicoNotificacao implements ServicoNotificacao {
  private transporte: Transporter;

  constructor(
    private readonly config: ConfigSmtp,
    private readonly sms: ServicoNotificacao,
  ) {
    this.transporte = nodemailer.createTransport({
      host: config.host,
      port: config.porta,
      secure: config.seguro,
      auth: config.usuario ? { user: config.usuario, pass: config.senha } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async enviarComprovante(params: EnviarComprovanteParams): Promise<void> {
    if (params.destino.canal !== 'email') {
      return this.sms.enviarComprovante(params);
    }
    try {
      await this.transporte.sendMail({
        from: this.config.remetente,
        // LGPD: dado pessoal — exige consentimento/criptografia (e-mail do destino)
        to: params.destino.email,
        subject: params.mensagem.assunto,
        text: params.mensagem.texto,
        html: params.mensagem.html,
      });
    } catch (err) {
      // A mensagem do provedor pode citar o endereço; no log, só o código.
      const codigo =
        (err as { code?: string; responseCode?: number }).responseCode ??
        (err as { code?: string }).code ??
        'desconhecido';
      throw new ErroNotificacao(`Servidor de e-mail recusou ou não respondeu (${codigo})`);
    }
  }
}
