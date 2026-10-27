import { useState } from 'react';
import { AvisoConsentimento } from '../../components/AvisoConsentimento';
import { BotaoTouch } from '../../components/BotaoTouch';
import { LeitorCodigo } from '../../components/LeitorCodigo';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import { useConfig, useTermoConsentimento } from '../../contexts/ConfigContext';
import { usePedido } from '../../contexts/PedidoContext';
import { useAvisoTemporario } from '../../hooks/useAvisoTemporario';
import { useConferenciaCpf } from '../../hooks/useConferenciaCpf';
import { informarFidelidade, registrarConsentimentos } from '../../services/apiClient';
import { formatarCpf } from '../../utils/cpf';

// Tela 1 — Programa de fidelidade (opcional).
// US-04 / US 08: o CPF identifica o cliente; com cadastro, mostra o saldo; sem cadastro,
// avisa e segue sem fidelidade. Também dá para ler o QR Code do cartão pela câmera.
// US 10: "Pular" vale só para a fidelidade — o CPF na nota e o comprovante ainda serão
// perguntados, uma vez cada, no momento deles.
// US 29: o teclado só é liberado depois que o cliente concorda com o uso do CPF na
// fidelidade; a decisão é registrada antes de o CPF ser enviado.
// LGPD: dado pessoal — exige consentimento/criptografia (CPF digitado nesta tela).
export function FidelidadeScreen() {
  const { aparencia } = useConfig();
  const termo = useTermoConsentimento();
  const {
    pedidoId,
    pedido,
    clienteFidelidade,
    irParaEtapa,
    definirClienteFidelidade,
    recarregarPedido,
    reiniciarPedido,
  } = usePedido();
  const [aceitou, setAceitou] = useState(pedido?.consentimentos?.fidelidade === true);
  const [cpf, setCpf] = useState(clienteFidelidade?.numeroFidelidade ?? '');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [leitorAberto, setLeitorAberto] = useState(false);
  const [aviso, mostrarAviso] = useAvisoTemporario();
  const situacao = useConferenciaCpf(cpf, aceitou);
  const cliente = situacao.tipo === 'valido' ? situacao.cliente : null;

  function mudarAceite(aceito: boolean) {
    setAceitou(aceito);
    // Sem o consentimento, o CPF não tem por que continuar na tela.
    if (!aceito) setCpf('');
  }

  async function seguir(acao: () => Promise<void>) {
    setEnviando(true);
    setErro(null);
    try {
      await acao();
      await recarregarPedido();
      irParaEtapa('cardapio');
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // Primeiro a decisão fica registrada; só então o CPF é enviado, e só se tiver cadastro.
  const continuar = () =>
    seguir(async () => {
      await registrarConsentimentos(pedidoId, termo.versao, { fidelidade: true });
      definirClienteFidelidade(cliente ? await informarFidelidade(pedidoId, cpf) : null);
    });

  // US 10: pular registra a recusa (US 29) e a fidelidade não é perguntada de novo.
  const pular = () =>
    seguir(async () => {
      if (pedido?.consentimentos?.fidelidade === undefined) {
        await registrarConsentimentos(pedidoId, termo.versao, { fidelidade: false });
      }
      definirClienteFidelidade(null);
    });

  return (
    <div className="tela">
      <h1 className="tela__titulo">{aparencia.paginas.fidelidade.titulo}</h1>
      <p className="tela__subtitulo">{aparencia.paginas.fidelidade.descricao}</p>
      {erro && <p className="erro">{erro}</p>}

      {clienteFidelidade ? (
        // Identificado pelo QR do cartão.
        <section className="cartao">
          <p className="pontos-fidelidade">
            <span>⭐ Saldo de pontos de fidelidade</span>
            <strong>{clienteFidelidade.pontos.toLocaleString('pt-BR')} pontos</strong>
          </p>
        </section>
      ) : (
        <section className="cartao identificacao">
          <div>
            <h2>⭐ CPF do programa de fidelidade</h2>
            <AvisoConsentimento
              termo={termo}
              finalidades={['fidelidade']}
              aceites={{ fidelidade: aceitou }}
              aoMudar={(_finalidade, aceito) => mudarAceite(aceito)}
            />
            <p className="valor-digitado">{formatarCpf(cpf) || '—'}</p>

            {!aceitou && <p className="aviso">Marque a caixa acima para liberar o teclado.</p>}
            {situacao.tipo === 'verificando' && <p className="aviso">Conferindo o CPF...</p>}
            {situacao.tipo === 'invalido' && (
              <p className="erro">CPF inválido. Confira os números digitados ou pule esta etapa.</p>
            )}
            {situacao.tipo === 'falha' && <p className="erro">{situacao.mensagem}</p>}
            {situacao.tipo === 'valido' && !cliente && (
              <p className="aviso-cadastro">
                Este CPF não tem cadastro no programa de fidelidade. Você pode continuar sem
                fidelidade.
              </p>
            )}
            {cliente && (
              <p className="pontos-fidelidade">
                <span>⭐ Saldo de pontos de fidelidade</span>
                <strong>{cliente.pontos.toLocaleString('pt-BR')} pontos</strong>
              </p>
            )}
            <BotaoTouch className="botao-camera" onClick={() => setLeitorAberto(true)}>
              📷 Ler o QR Code do cartão
            </BotaoTouch>
          </div>
          <TecladoNumerico
            valor={cpf}
            onChange={setCpf}
            tamanhoMaximo={11}
            desabilitado={!aceitou}
          />
        </section>
      )}

      {aviso && (
        <p className="aviso-flutuante" role="status">
          {aviso}
        </p>
      )}

      <div className="tela__acoes">
        <BotaoTouch onClick={reiniciarPedido}>Voltar ao início</BotaoTouch>
        <div className="tela__acoes-grupo">
          {!clienteFidelidade && (
            <BotaoTouch onClick={pular} disabled={enviando}>
              Pular
            </BotaoTouch>
          )}
          <BotaoTouch
            variante="primario"
            onClick={clienteFidelidade ? () => irParaEtapa('cardapio') : continuar}
            disabled={enviando || (!clienteFidelidade && situacao.tipo !== 'valido')}
          >
            Continuar
          </BotaoTouch>
        </div>
      </div>

      {leitorAberto && (
        <LeitorCodigo aoFechar={() => setLeitorAberto(false)} aoResultado={mostrarAviso} />
      )}
    </div>
  );
}
