import { useState } from 'react';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import { informarCpfNota, informarFidelidade } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';
import { BotaoTouch } from '../../components/BotaoTouch';

// US-04: Informar fidelidade (opcional).
// US-05: Informar CPF na nota (opcional).
// LGPD: dado pessoal — exige consentimento/criptografia (número de fidelidade e CPF
// digitados nesta tela).
// TODO: exibir texto de consentimento explícito antes da captura destes dados.
export function IdentificacaoScreen() {
  const [numeroFidelidade, setNumeroFidelidade] = useState('');
  const [cpf, setCpf] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { pedidoId, irParaEtapa } = usePedido();

  async function continuar() {
    setEnviando(true);
    setErro(null);
    try {
      if (numeroFidelidade) {
        await informarFidelidade(pedidoId, numeroFidelidade);
      }
      if (cpf) {
        await informarCpfNota(pedidoId, cpf);
      }
      irParaEtapa('pagamento');
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela">
      <h1>Identificação (opcional)</h1>
      {erro && <p className="erro">{erro}</p>}

      <section>
        <h2>Número de fidelidade</h2>
        <p className="valor-digitado">{numeroFidelidade || '—'}</p>
        <TecladoNumerico valor={numeroFidelidade} onChange={setNumeroFidelidade} tamanhoMaximo={12} />
      </section>

      <section>
        <h2>CPF na nota</h2>
        <p className="valor-digitado">{cpf || '—'}</p>
        <TecladoNumerico valor={cpf} onChange={setCpf} tamanhoMaximo={11} />
      </section>

      <div className="tela__acoes">
        <BotaoTouch onClick={() => irParaEtapa('carrinho')}>Voltar</BotaoTouch>
        <BotaoTouch onClick={continuar} disabled={enviando}>
          {numeroFidelidade || cpf ? 'Continuar' : 'Pular'}
        </BotaoTouch>
      </div>
    </div>
  );
}
