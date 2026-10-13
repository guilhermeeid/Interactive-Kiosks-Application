import { useCallback, useRef, useState } from 'react';
import type { FormaPagamento } from '@totem/shared';
import {
  aplicarCupom,
  escolherFormaPagamento,
  removerCupom,
  usarPontos,
} from '../../services/apiClient';
import { useConfig } from '../../contexts/ConfigContext';
import { usePedido } from '../../contexts/PedidoContext';
import { useFecharAoTocarFora } from '../../hooks/useFecharAoTocarFora';
import { BotaoTouch } from '../../components/BotaoTouch';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import { TecladoVirtual } from '../../components/TecladoVirtual';
import { formatarCentavos } from '../../utils/formatarMoeda';

const FORMAS: { valor: FormaPagamento; rotulo: string; icone: string }[] = [
  { valor: 'credito', rotulo: 'Crédito', icone: '💳' },
  { valor: 'debito', rotulo: 'Débito', icone: '🏧' },
  { valor: 'pix', rotulo: 'Pix', icone: '⚡' },
  { valor: 'dinheiro', rotulo: 'Dinheiro', icone: '💵' },
];

// US-06: Escolher forma de pagamento.
// US 13: Aplicar cupom de desconto (campo com teclado virtual).
// É a única tela que mostra descontos: subtotal, cada desconto (cupom, pontos de
// fidelidade) e o total a pagar. Todos os valores vêm prontos do servidor, no pedido —
// a tela nunca calcula o total por conta própria.
// IMPORTANTE: esta tela nunca deve capturar ou armazenar dados de cartão — a
// tokenização acontece no gateway/adquirente (ver apps/api/src/integrations/gateway-pagamento).
export function PagamentoScreen() {
  const [codigoCupom, setCodigoCupom] = useState('');
  const [erroCupom, setErroCupom] = useState<string | null>(null);
  const [tecladoCupomAberto, setTecladoCupomAberto] = useState(false);
  const [pontosDigitados, setPontosDigitados] = useState('');
  const [erroPontos, setErroPontos] = useState<string | null>(null);
  const [tecladoPontosAberto, setTecladoPontosAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const cupomRef = useRef<HTMLDivElement>(null);
  const pontosRef = useRef<HTMLDivElement>(null);
  const { aparencia, fidelidade, formasPagamento, cuponsHabilitados } = useConfig();
  const { pedidoId, pedido, clienteFidelidade, recarregarPedido, irParaEtapa } = usePedido();

  // Fecha o teclado ao tocar fora do campo; o que foi digitado permanece.
  const fecharTecladoCupom = useCallback(() => setTecladoCupomAberto(false), []);
  useFecharAoTocarFora(cupomRef, tecladoCupomAberto, fecharTecladoCupom);
  const fecharTecladoPontos = useCallback(() => setTecladoPontosAberto(false), []);
  useFecharAoTocarFora(pontosRef, tecladoPontosAberto, fecharTecladoPontos);

  // Executa uma mudança de desconto e recarrega o pedido, de onde saem os valores.
  async function alterarDesconto(acao: () => Promise<unknown>, aoFalhar: (mensagem: string) => void) {
    setErro(null);
    try {
      await acao();
    } catch (err) {
      aoFalhar((err as Error).message);
    }
    await recarregarPedido().catch(() => undefined);
  }

  // US 13: cupom recusado não altera o pedido, que segue com o total anterior.
  function aplicar() {
    setErroCupom(null);
    setTecladoCupomAberto(false);
    return alterarDesconto(async () => {
      await aplicarCupom(pedidoId, codigoCupom);
      setCodigoCupom('');
    }, setErroCupom);
  }

  // O servidor recusa (e explica) se o cliente pedir mais pontos do que tem.
  function aplicarPontos() {
    setErroPontos(null);
    setTecladoPontosAberto(false);
    return alterarDesconto(async () => {
      await usarPontos(pedidoId, Number(pontosDigitados));
      setPontosDigitados('');
    }, setErroPontos);
  }

  // US-06
  async function pagar(forma: FormaPagamento) {
    setProcessando(true);
    setErro(null);
    try {
      const resultado = await escolherFormaPagamento(pedidoId, forma);
      if (resultado.status !== 'autorizado') {
        setErro(`Pagamento ${resultado.status}`);
        return;
      }
      await recarregarPedido();
      irParaEtapa('comprovante');
    } catch (err) {
      setErro((err as Error).message);
      // Um pagamento recusado pode ter mudado o pedido (ex.: cupom que venceu).
      await recarregarPedido().catch(() => undefined);
    } finally {
      setProcessando(false);
    }
  }

  const formasAceitas = FORMAS.filter(
    (forma) => forma.valor === 'dinheiro' || formasPagamento[forma.valor],
  );
  const podeUsarPontos = fidelidade.habilitado && clienteFidelidade !== null;
  const descontoCupom = pedido?.descontoCupomCentavos ?? 0;
  const descontoPontos = pedido?.descontoPontosCentavos ?? 0;

  return (
    <div className="tela">
      <h1 className="tela__titulo">{aparencia.paginas.pagamento.titulo}</h1>
      <p className="tela__subtitulo">{aparencia.paginas.pagamento.descricao}</p>

      {cuponsHabilitados && (
        <section className="cartao">
          <h2>🏷️ Cupom de desconto</h2>
          {/* US 14: com um cupom aplicado, dá para removê-lo (volta o valor integral) ou
              digitar outro código, que substitui o atual se for válido. */}
          {pedido?.cupomAplicado && (
            <div className="desconto-aplicado">
              <p className="desconto">Cupom {pedido.cupomAplicado} aplicado</p>
              <BotaoTouch
                variante="perigo"
                onClick={() => alterarDesconto(() => removerCupom(pedidoId), setErroCupom)}
              >
                Remover
              </BotaoTouch>
            </div>
          )}
          <div ref={cupomRef}>
            <div className="cupom">
              <input
                readOnly
                value={codigoCupom}
                onClick={() => setTecladoCupomAberto(true)}
                onFocus={() => setTecladoCupomAberto(true)}
                placeholder={pedido?.cupomAplicado ? 'Trocar por outro cupom' : 'Código do cupom'}
                aria-label="Código do cupom"
              />
              {codigoCupom && (
                <BotaoTouch variante="perigo" onClick={() => setCodigoCupom('')}>
                  Limpar
                </BotaoTouch>
              )}
              <BotaoTouch variante="destaque" onClick={aplicar} disabled={!codigoCupom.trim()}>
                {pedido?.cupomAplicado ? 'Trocar' : 'Aplicar'}
              </BotaoTouch>
            </div>
            {tecladoCupomAberto && (
              <TecladoVirtual valor={codigoCupom} onChange={setCodigoCupom} maiusculas />
            )}
          </div>
          {erroCupom && <p className="erro">{erroCupom}</p>}
        </section>
      )}

      {/* Sem CPF cadastrado na fidelidade, o campo de pontos nem aparece. */}
      {podeUsarPontos && (
        <section className="cartao">
          <h2>⭐ Pontos de fidelidade</h2>
          <p className="saldo-pontos">
            Seu saldo: <strong>{clienteFidelidade.pontos.toLocaleString('pt-BR')} pontos</strong>{' '}
            ({fidelidade.pontosPorReal.toLocaleString('pt-BR')} pontos = R$ 1,00)
          </p>
          {pedido?.pontosUsados ? (
            <div className="desconto-aplicado">
              <p className="desconto">
                {pedido.pontosUsados.toLocaleString('pt-BR')} pontos usados neste pedido
              </p>
              <BotaoTouch
                variante="perigo"
                onClick={() => alterarDesconto(() => usarPontos(pedidoId, 0), setErroPontos)}
              >
                Remover
              </BotaoTouch>
            </div>
          ) : (
            <div ref={pontosRef}>
              <div className="cupom">
                <input
                  readOnly
                  value={pontosDigitados}
                  onClick={() => setTecladoPontosAberto(true)}
                  onFocus={() => setTecladoPontosAberto(true)}
                  placeholder="Quantos pontos usar"
                  aria-label="Quantos pontos usar"
                />
                {pontosDigitados && (
                  <BotaoTouch variante="perigo" onClick={() => setPontosDigitados('')}>
                    Limpar
                  </BotaoTouch>
                )}
                <BotaoTouch
                  variante="destaque"
                  onClick={aplicarPontos}
                  disabled={!Number(pontosDigitados)}
                >
                  Usar pontos
                </BotaoTouch>
              </div>
              {tecladoPontosAberto && (
                <TecladoNumerico
                  valor={pontosDigitados}
                  onChange={setPontosDigitados}
                  tamanhoMaximo={9}
                />
              )}
            </div>
          )}
          {erroPontos && <p className="erro">{erroPontos}</p>}
        </section>
      )}

      <div className="resumo">
        <div className="resumo__detalhe">
          <p className="resumo__linha">
            <span>Subtotal</span>
            <span>{formatarCentavos(pedido?.valorTotalCentavos ?? 0)}</span>
          </p>
          {descontoCupom > 0 && (
            <p className="resumo__linha resumo__linha--desconto">
              <span>Cupom {pedido?.cupomAplicado}</span>
              <span>− {formatarCentavos(descontoCupom)}</span>
            </p>
          )}
          {descontoPontos > 0 && (
            <p className="resumo__linha resumo__linha--desconto">
              <span>Pontos de fidelidade ({pedido?.pontosUsados?.toLocaleString('pt-BR')})</span>
              <span>− {formatarCentavos(descontoPontos)}</span>
            </p>
          )}
        </div>
        <p className="total">
          <span>Total a pagar</span>
          <strong>{formatarCentavos(pedido?.valorAPagarCentavos ?? 0)}</strong>
        </p>
      </div>

      {erro && <p className="erro">{erro}</p>}

      <section className="formas-pagamento">
        {formasAceitas.map((forma) => (
          <BotaoTouch
            key={forma.valor}
            className="forma-pagamento"
            onClick={() => pagar(forma.valor)}
            disabled={processando}
          >
            <span className="forma-pagamento__icone" aria-hidden="true">
              {forma.icone}
            </span>
            {forma.rotulo}
          </BotaoTouch>
        ))}
      </section>

      {/* US 10: quem pulou a identificação volta direto ao carrinho, sem ser perguntado
          de novo pelos dados pessoais. */}
      <BotaoTouch
        onClick={() => irParaEtapa(pedido?.semDadosPessoais ? 'carrinho' : 'identificacao')}
      >
        Voltar
      </BotaoTouch>
    </div>
  );
}
