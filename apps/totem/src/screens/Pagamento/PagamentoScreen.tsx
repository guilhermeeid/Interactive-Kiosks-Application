import { useState } from 'react';
import type { ConsumoPedido, FormaPagamento } from '@totem/shared';
import {
  escolherFormaPagamento,
  informarCpfNota,
  registrarConsentimentos,
} from '../../services/apiClient';
import { useConfig, useTermoConsentimento } from '../../contexts/ConfigContext';
import { usePedido } from '../../contexts/PedidoContext';
import { useConferenciaCpf } from '../../hooks/useConferenciaCpf';
import { AvisoConsentimento } from '../../components/AvisoConsentimento';
import { BotaoTouch } from '../../components/BotaoTouch';
import { ResumoPedido } from '../../components/ResumoPedido';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import { formatarCpf, mascararCpf } from '../../utils/cpf';
import { FORMAS_PAGAMENTO } from '../../utils/formasPagamento';

// Tela 4 — Pagamento.
// Item 11: antes de pagar, "Para comer aqui" ou "Para levar" (com uma opção desligada,
// vale a outra).
// Item 3 / US 09: CPF na nota, independente do CPF da fidelidade: o mesmo, outro ou
// nenhum. Perguntado uma vez só (US 10); o consentimento é registrado antes de o CPF ir
// para o pedido (US 29).
// US-06: escolher a forma de pagamento. Dinheiro manda o cliente ao caixa (item 2).
// IMPORTANTE: esta tela nunca deve capturar ou armazenar dados de cartão — a
// tokenização acontece no gateway/adquirente (ver apps/api/src/integrations/gateway-pagamento).
// LGPD: dado pessoal — exige consentimento/criptografia (CPF digitado nesta tela).
export function PagamentoScreen() {
  const { aparencia, formasPagamento, consumo: opcoesConsumo } = useConfig();
  const termo = useTermoConsentimento();
  const { pedidoId, pedido, clienteFidelidade, recarregarPedido, irParaEtapa } = usePedido();
  const escolheConsumo = opcoesConsumo.local && opcoesConsumo.viagem;
  const [consumo, setConsumo] = useState<ConsumoPedido | null>(
    pedido?.consumo ?? (escolheConsumo ? null : opcoesConsumo.local ? 'local' : 'viagem'),
  );

  // CPF na nota: `undefined` = ainda não decidido neste pedido.
  const decisaoCpf = pedido?.consentimentos?.cpf_nota;
  const [aceitouCpf, setAceitouCpf] = useState(false);
  // Com fidelidade: usar o mesmo CPF dela? (`null` = ainda não respondeu)
  const [mesmoCpf, setMesmoCpf] = useState<boolean | null>(clienteFidelidade ? null : false);
  const [cpf, setCpf] = useState('');
  const situacaoCpf = useConferenciaCpf(mesmoCpf === false ? cpf : '', false);

  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  const cpfDaNota = mesmoCpf && clienteFidelidade ? clienteFidelidade.numeroFidelidade : cpf;
  const cpfPronto =
    decisaoCpf !== undefined ||
    !aceitouCpf ||
    mesmoCpf === true ||
    (mesmoCpf === false && situacaoCpf.tipo === 'valido');
  const podePagar = !processando && consumo !== null && cpfPronto;

  function mudarAceiteCpf(aceito: boolean) {
    setAceitouCpf(aceito);
    if (!aceito) {
      setCpf('');
      setMesmoCpf(clienteFidelidade ? null : false);
    }
  }

  // A decisão sobre o CPF na nota é registrada só agora, ao pagar: desmarcado = recusa.
  async function registrarCpfNota() {
    if (decisaoCpf !== undefined) return;
    if (!aceitouCpf) {
      await registrarConsentimentos(pedidoId, termo.versao, { cpf_nota: false });
      return;
    }
    await registrarConsentimentos(pedidoId, termo.versao, { cpf_nota: true });
    await informarCpfNota(pedidoId, cpfDaNota);
  }

  async function pagar(forma: FormaPagamento) {
    if (!consumo) return;
    setProcessando(true);
    setErro(null);
    try {
      await registrarCpfNota();
      const resultado = await escolherFormaPagamento(pedidoId, forma, consumo);
      const aprovado =
        resultado.status === 'autorizado' ||
        (forma === 'dinheiro' && resultado.status === 'pendente');
      if (!aprovado) {
        setErro(`Pagamento ${resultado.status}`);
        return;
      }
      await recarregarPedido();
      irParaEtapa('conclusao');
    } catch (err) {
      setErro((err as Error).message);
      // Um pagamento recusado pode ter mudado o pedido (ex.: cupom que venceu).
      await recarregarPedido().catch(() => undefined);
    } finally {
      setProcessando(false);
    }
  }

  const formasAceitas = FORMAS_PAGAMENTO.filter((forma) => formasPagamento[forma.valor]);

  return (
    <div className="tela">
      <h1 className="tela__titulo">{aparencia.paginas.pagamento.titulo}</h1>
      <p className="tela__subtitulo">{aparencia.paginas.pagamento.descricao}</p>

      {escolheConsumo && (
        <section className="consumo" aria-label="Onde você vai comer?">
          <BotaoTouch
            className={
              consumo === 'local' ? 'consumo__opcao consumo__opcao--ativa' : 'consumo__opcao'
            }
            aria-pressed={consumo === 'local'}
            onClick={() => setConsumo('local')}
          >
            <span aria-hidden="true">🍽️</span> Para comer aqui
          </BotaoTouch>
          <BotaoTouch
            className={
              consumo === 'viagem' ? 'consumo__opcao consumo__opcao--ativa' : 'consumo__opcao'
            }
            aria-pressed={consumo === 'viagem'}
            onClick={() => setConsumo('viagem')}
          >
            <span aria-hidden="true">🛍️</span> Para levar
          </BotaoTouch>
        </section>
      )}

      <section className="cartao">
        <h2>🧾 CPF na nota fiscal (opcional)</h2>
        {decisaoCpf === true && pedido?.cpfNaNota && (
          <p className="aviso-cadastro aviso-cadastro--ok">
            CPF na nota: {mascararCpf(pedido.cpfNaNota)}
          </p>
        )}
        {decisaoCpf === false && <p className="aviso">Sem CPF na nota neste pedido.</p>}
        {decisaoCpf === undefined && (
          <>
            <AvisoConsentimento
              termo={termo}
              finalidades={['cpf_nota']}
              aceites={{ cpf_nota: aceitouCpf }}
              aoMudar={(_finalidade, aceito) => mudarAceiteCpf(aceito)}
            />
            {!aceitouCpf && <p className="aviso">Deixe desmarcado para seguir sem CPF na nota.</p>}
            {aceitouCpf && clienteFidelidade && (
              <div className="cpf-escolha">
                <p>
                  Incluir o mesmo CPF do programa de fidelidade (
                  {mascararCpf(clienteFidelidade.numeroFidelidade)})?
                </p>
                <div className="tela__acoes-grupo">
                  <BotaoTouch
                    variante={mesmoCpf === true ? 'destaque' : 'padrao'}
                    aria-pressed={mesmoCpf === true}
                    onClick={() => setMesmoCpf(true)}
                  >
                    Sim, o mesmo CPF
                  </BotaoTouch>
                  <BotaoTouch
                    variante={mesmoCpf === false ? 'destaque' : 'padrao'}
                    aria-pressed={mesmoCpf === false}
                    onClick={() => setMesmoCpf(false)}
                  >
                    Outro CPF
                  </BotaoTouch>
                </div>
              </div>
            )}
            {aceitouCpf && mesmoCpf === false && (
              <div className="identificacao">
                <div>
                  <p className="valor-digitado">{formatarCpf(cpf) || '—'}</p>
                  {situacaoCpf.tipo === 'verificando' && (
                    <p className="aviso">Conferindo o CPF...</p>
                  )}
                  {situacaoCpf.tipo === 'invalido' && (
                    <p className="erro">CPF inválido. Confira os números ou desmarque a caixa.</p>
                  )}
                  {situacaoCpf.tipo === 'falha' && <p className="erro">{situacaoCpf.mensagem}</p>}
                  {situacaoCpf.tipo === 'valido' && (
                    <p className="aviso-cadastro aviso-cadastro--ok">
                      CPF conferido. Ele vai na nota fiscal deste pedido.
                    </p>
                  )}
                </div>
                <TecladoNumerico valor={cpf} onChange={setCpf} tamanhoMaximo={11} />
              </div>
            )}
          </>
        )}
      </section>

      <ResumoPedido pedido={pedido} />

      {erro && <p className="erro">{erro}</p>}
      {escolheConsumo && consumo === null && (
        <p className="aviso">Escolha acima se é para comer aqui ou para levar.</p>
      )}

      <section className="formas-pagamento">
        {formasAceitas.map((forma) => (
          <BotaoTouch
            key={forma.valor}
            className="forma-pagamento"
            onClick={() => pagar(forma.valor)}
            disabled={!podePagar}
          >
            <span className="forma-pagamento__icone" aria-hidden="true">
              {forma.icone}
            </span>
            {forma.rotulo}
          </BotaoTouch>
        ))}
      </section>

      <BotaoTouch onClick={() => irParaEtapa('carrinho')}>Voltar ao carrinho</BotaoTouch>
    </div>
  );
}
