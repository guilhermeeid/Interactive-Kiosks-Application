import { useState } from 'react';
import type { CanalComprovante, Comprovante } from '@totem/shared';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import { enviarComprovante } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';
import { BotaoTouch } from '../../components/BotaoTouch';

// US-08: Receber comprovante por e-mail/SMS.
// LGPD: dado pessoal — exige consentimento/criptografia (e-mail/telefone digitados
// nesta tela).
// TODO: exibir texto de consentimento explícito antes da captura destes dados.
export function ComprovanteScreen() {
  const [canal, setCanal] = useState<CanalComprovante>('email');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [comprovante, setComprovante] = useState<Comprovante | null>(null);
  const { pedidoId, reiniciarPedido } = usePedido();

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      const resultado = await enviarComprovante(pedidoId, {
        canal,
        email: canal === 'email' ? email : undefined,
        telefone: canal === 'sms' ? telefone : undefined,
      });
      setComprovante(resultado);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (comprovante) {
    return (
      <div className="tela">
        <div className="sucesso cartao">
          <div className="sucesso__icone" aria-hidden="true">
            🎉
          </div>
          <h1 className="tela__titulo">Pedido concluído!</h1>
          <p className="tela__subtitulo">Comprovante enviado por {comprovante.destino.canal}.</p>
          {comprovante.notaFiscalUrl && (
            <p className="nota">Nota fiscal: {comprovante.notaFiscalUrl}</p>
          )}
          <BotaoTouch variante="primario" onClick={reiniciarPedido}>
            Novo pedido
          </BotaoTouch>
        </div>
      </div>
    );
  }

  const podeEnviar = canal === 'email' ? email.length > 0 : telefone.length > 0;

  return (
    <div className="tela">
      <h1 className="tela__titulo">Comprovante</h1>
      <p className="tela__subtitulo">Como você quer receber seu comprovante?</p>

      <div className="segmento">
        <BotaoTouch onClick={() => setCanal('email')} disabled={canal === 'email'}>
          ✉️ E-mail
        </BotaoTouch>
        <BotaoTouch onClick={() => setCanal('sms')} disabled={canal === 'sms'}>
          📱 SMS
        </BotaoTouch>
      </div>

      <section className="cartao">
        {canal === 'email' ? (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seuemail@exemplo.com"
          />
        ) : (
          <>
            <p className="valor-digitado">{telefone || '—'}</p>
            <TecladoNumerico valor={telefone} onChange={setTelefone} tamanhoMaximo={11} />
          </>
        )}
      </section>

      {erro && <p className="erro">{erro}</p>}

      <div className="tela__acoes">
        <span />
        <BotaoTouch variante="primario" onClick={enviar} disabled={enviando || !podeEnviar}>
          Enviar comprovante
        </BotaoTouch>
      </div>
    </div>
  );
}
