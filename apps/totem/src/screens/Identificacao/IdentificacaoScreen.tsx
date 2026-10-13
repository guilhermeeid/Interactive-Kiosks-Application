import { useEffect, useState } from 'react';
import type { ClienteFidelidade, FinalidadeConsentimento } from '@totem/shared';
import { AvisoConsentimento } from '../../components/AvisoConsentimento';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import {
  consultarCpf,
  ErroApi,
  informarCpfNota,
  informarFidelidade,
  pularIdentificacao,
  registrarConsentimentos,
} from '../../services/apiClient';
import { useConfig, useTermoConsentimento } from '../../contexts/ConfigContext';
import { usePedido } from '../../contexts/PedidoContext';
import { BotaoTouch } from '../../components/BotaoTouch';
import { formatarCpf } from '../../utils/cpf';

// O que se sabe sobre o CPF digitado. A conferência dos dígitos verificadores e a busca
// do cadastro de fidelidade são feitas pela API assim que o 11º dígito é digitado.
type SituacaoCpf =
  | { tipo: 'incompleto' }
  | { tipo: 'verificando' }
  | { tipo: 'invalido' }
  | { tipo: 'valido'; cliente: ClienteFidelidade | null }
  | { tipo: 'falha'; mensagem: string };

// US 09: Informar CPF na nota (opcional).
// US-04: Informar fidelidade (opcional) — o CPF é o número de fidelidade.
// US 10: Pular — o pedido segue sem dados pessoais e eles não são pedidos de novo.
// US 29: o teclado só é liberado depois que o cliente marca, no aviso de privacidade,
// para que quer usar o CPF; a decisão é registrada antes de o CPF ser enviado.
// LGPD: dado pessoal — exige consentimento/criptografia (CPF digitado nesta tela).
export function IdentificacaoScreen() {
  const { aparencia, fidelidade } = useConfig();
  const termo = useTermoConsentimento();
  const {
    pedidoId,
    pedido,
    clienteFidelidade,
    irParaEtapa,
    definirClienteFidelidade,
    recarregarPedido,
  } = usePedido();
  const finalidades: FinalidadeConsentimento[] = fidelidade.habilitado
    ? ['cpf_nota', 'fidelidade']
    : ['cpf_nota'];

  // Ao voltar do pagamento, reaparecem as escolhas e o CPF já informados.
  const [aceites, setAceites] = useState({
    cpf_nota: pedido?.consentimentos?.cpf_nota === true,
    fidelidade: fidelidade.habilitado && pedido?.consentimentos?.fidelidade === true,
  });
  const [cpf, setCpf] = useState(pedido?.cpfNaNota ?? clienteFidelidade?.numeroFidelidade ?? '');
  const [situacao, setSituacao] = useState<SituacaoCpf>({ tipo: 'incompleto' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const consentiu = aceites.cpf_nota || aceites.fidelidade;

  function mudarAceite(finalidade: FinalidadeConsentimento, aceito: boolean) {
    const novos = { ...aceites, [finalidade]: aceito };
    setAceites(novos);
    // Sem nenhuma finalidade aceita, o CPF não tem por que continuar na tela.
    if (!novos.cpf_nota && !novos.fidelidade) {
      setCpf('');
    }
  }

  useEffect(() => {
    if (cpf.length < 11) {
      setSituacao({ tipo: 'incompleto' });
      return;
    }

    let cancelado = false;
    setSituacao({ tipo: 'verificando' });
    // O cadastro de fidelidade só é consultado se o cliente marcou essa finalidade.
    consultarCpf(cpf, aceites.fidelidade)
      .then(({ cliente }) => !cancelado && setSituacao({ tipo: 'valido', cliente }))
      .catch((err: Error) => {
        if (cancelado) return;
        if (err instanceof ErroApi && err.status === 400) setSituacao({ tipo: 'invalido' });
        else setSituacao({ tipo: 'falha', mensagem: err.message });
      });
    return () => {
      cancelado = true;
    };
  }, [cpf, aceites.fidelidade]);

  async function seguir(acao: () => Promise<void>) {
    setEnviando(true);
    setErro(null);
    try {
      await acao();
      await recarregarPedido();
      irParaEtapa('pagamento');
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // Primeiro a decisão sobre cada finalidade fica registrada; só então o CPF é enviado,
  // e apenas para as finalidades aceitas.
  const continuarComCpf = () =>
    seguir(async () => {
      await registrarConsentimentos(
        pedidoId,
        termo.versao,
        fidelidade.habilitado ? aceites : { cpf_nota: aceites.cpf_nota },
      );
      if (aceites.cpf_nota) {
        await informarCpfNota(pedidoId, cpf);
      }
      const cadastrado = situacao.tipo === 'valido' && situacao.cliente !== null;
      definirClienteFidelidade(
        aceites.fidelidade && cadastrado ? await informarFidelidade(pedidoId, cpf) : null,
      );
    });

  const pular = () =>
    seguir(async () => {
      await pularIdentificacao(pedidoId, termo.versao);
      definirClienteFidelidade(null);
    });

  const cliente = situacao.tipo === 'valido' ? situacao.cliente : null;

  return (
    <div className="tela">
      <h1 className="tela__titulo">{aparencia.paginas.identificacao.titulo}</h1>
      <p className="tela__subtitulo">{aparencia.paginas.identificacao.descricao}</p>
      {erro && <p className="erro">{erro}</p>}

      <section className="cartao identificacao">
        <div>
          <h2>🧾 CPF na nota{fidelidade.habilitado && ' e fidelidade'}</h2>
          <AvisoConsentimento
            termo={termo}
            finalidades={finalidades}
            aceites={aceites}
            aoMudar={mudarAceite}
          />
          <p className="valor-digitado">{formatarCpf(cpf) || '—'}</p>

          {!consentiu && (
            <p className="aviso">Marque acima para que quer usar o CPF e o teclado é liberado.</p>
          )}
          {situacao.tipo === 'verificando' && <p className="aviso">Conferindo o CPF...</p>}
          {situacao.tipo === 'invalido' && (
            <p className="erro">CPF inválido. Confira os números digitados ou pule esta etapa.</p>
          )}
          {situacao.tipo === 'falha' && <p className="erro">{situacao.mensagem}</p>}
          {situacao.tipo === 'valido' && aceites.cpf_nota && (
            <p className="aviso-cadastro aviso-cadastro--ok">
              CPF conferido. Ele vai na nota fiscal deste pedido.
            </p>
          )}
          {situacao.tipo === 'valido' && aceites.fidelidade && !cliente && (
            <p className="aviso-cadastro">
              Este CPF não tem cadastro no programa de fidelidade. Você pode continuar sem
              fidelidade.
            </p>
          )}
          {aceites.fidelidade && cliente && (
            <p className="pontos-fidelidade">
              <span>⭐ Saldo de pontos de fidelidade</span>
              <strong>{cliente.pontos.toLocaleString('pt-BR')} pontos</strong>
            </p>
          )}
        </div>
        <TecladoNumerico valor={cpf} onChange={setCpf} tamanhoMaximo={11} desabilitado={!consentiu} />
      </section>

      <div className="tela__acoes">
        <BotaoTouch onClick={() => irParaEtapa('carrinho')}>Voltar</BotaoTouch>
        {cpf ? (
          <div className="tela__acoes-grupo">
            <BotaoTouch onClick={pular} disabled={enviando}>
              Pular
            </BotaoTouch>
            <BotaoTouch
              variante="primario"
              onClick={continuarComCpf}
              disabled={enviando || situacao.tipo !== 'valido'}
            >
              Continuar
            </BotaoTouch>
          </div>
        ) : (
          <BotaoTouch variante="primario" onClick={pular} disabled={enviando}>
            Pular
          </BotaoTouch>
        )}
      </div>
      <p className="tela__nota">
        Ao pular, o pedido segue sem dados pessoais e eles não serão pedidos de novo.
      </p>
    </div>
  );
}
