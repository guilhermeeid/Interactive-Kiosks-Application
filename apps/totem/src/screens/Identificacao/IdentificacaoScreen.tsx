import { useEffect, useState } from 'react';
import type { ClienteFidelidade } from '@totem/shared';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import {
  consultarFidelidade,
  informarCpfNota,
  informarFidelidade,
} from '../../services/apiClient';
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
  const [clienteEncontrado, setClienteEncontrado] = useState<ClienteFidelidade | null>(null);
  const { pedidoId, irParaEtapa, definirClienteFidelidade } = usePedido();

  // Exibe o saldo assim que o número de fidelidade (ou o CPF completo, que também
  // serve como número de fidelidade) corresponde a um cliente cadastrado.
  const chaveFidelidade = numeroFidelidade || (cpf.length === 11 ? cpf : '');
  useEffect(() => {
    setClienteEncontrado(null);
    if (!chaveFidelidade) return;

    let cancelado = false;
    consultarFidelidade(chaveFidelidade)
      .then((cliente) => !cancelado && setClienteEncontrado(cliente))
      .catch(() => {
        // Número não cadastrado: nada a exibir.
      });
    return () => {
      cancelado = true;
    };
  }, [chaveFidelidade]);

  async function continuar() {
    setEnviando(true);
    setErro(null);
    try {
      const numero = numeroFidelidade || clienteEncontrado?.numeroFidelidade;
      definirClienteFidelidade(numero ? await informarFidelidade(pedidoId, numero) : null);
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
      <h1 className="tela__titulo">Identificação (opcional)</h1>
      <p className="tela__subtitulo">Informe seus dados ou pule esta etapa.</p>
      {erro && <p className="erro">{erro}</p>}

      <div className="grade-2">
        <section className="cartao">
          <h2>⭐ Número de fidelidade</h2>
          <p className="valor-digitado">{numeroFidelidade || '—'}</p>
          <TecladoNumerico valor={numeroFidelidade} onChange={setNumeroFidelidade} tamanhoMaximo={12} />
        </section>

        <section className="cartao">
          <h2>🧾 CPF na nota</h2>
          <p className="valor-digitado">{cpf || '—'}</p>
          <TecladoNumerico valor={cpf} onChange={setCpf} tamanhoMaximo={11} />
        </section>
      </div>

      {clienteEncontrado && (
        <p className="pontos-fidelidade">
          <span>⭐ Subtotal de pontos de fidelidade</span>
          <strong>{clienteEncontrado.pontos.toLocaleString('pt-BR')} pontos</strong>
        </p>
      )}

      <div className="tela__acoes">
        <BotaoTouch onClick={() => irParaEtapa('carrinho')}>Voltar</BotaoTouch>
        <BotaoTouch variante="primario" onClick={continuar} disabled={enviando}>
          {numeroFidelidade || cpf ? 'Continuar' : 'Pular'}
        </BotaoTouch>
      </div>
    </div>
  );
}
