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
        <h1>Pedido concluído!</h1>
        <p>Comprovante enviado por {comprovante.destino.canal}.</p>
        {comprovante.notaFiscalUrl && <p>Nota fiscal: {comprovante.notaFiscalUrl}</p>}
        <BotaoTouch onClick={reiniciarPedido}>Novo pedido</BotaoTouch>
      </div>
    );
  }

  const podeEnviar = canal === 'email' ? email.length > 0 : telefone.length > 0;

  return (
    <div className="tela">
      <h1>Comprovante</h1>

      <div className="tela__acoes">
        <BotaoTouch onClick={() => setCanal('email')} disabled={canal === 'email'}>
          E-mail
        </BotaoTouch>
        <BotaoTouch onClick={() => setCanal('sms')} disabled={canal === 'sms'}>
          SMS
        </BotaoTouch>
      </div>

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

      {erro && <p className="erro">{erro}</p>}

      <BotaoTouch onClick={enviar} disabled={enviando || !podeEnviar}>
        Enviar comprovante
      </BotaoTouch>
    </div>
  );
}
