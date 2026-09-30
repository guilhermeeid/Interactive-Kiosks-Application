import { useState } from 'react';
import type { FormaPagamento, ResultadoAplicacaoCupom } from '@totem/shared';
import { aplicarCupom, escolherFormaPagamento } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';
import { BotaoTouch } from '../../components/BotaoTouch';
import { formatarCentavos } from '../../utils/formatarMoeda';

const FORMAS: { valor: FormaPagamento; rotulo: string; icone: string }[] = [
  { valor: 'credito', rotulo: 'Crédito', icone: '💳' },
  { valor: 'debito', rotulo: 'Débito', icone: '🏧' },
  { valor: 'pix', rotulo: 'Pix', icone: '⚡' },
  { valor: 'dinheiro', rotulo: 'Dinheiro', icone: '💵' },
];

// US-06: Escolher forma de pagamento.
// US-07: Aplicar cupom de desconto.
// IMPORTANTE: esta tela nunca deve capturar ou armazenar dados de cartão — a
// tokenização acontece no gateway/adquirente (ver apps/api/src/integrations/gateway-pagamento).
export function PagamentoScreen() {
  const [codigoCupom, setCodigoCupom] = useState('');
  const [cupomAplicado, setCupomAplicado] = useState<ResultadoAplicacaoCupom | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const { pedidoId, pedido, clienteFidelidade, recarregarPedido, irParaEtapa } = usePedido();

  // US-07
  async function aplicar() {
    setErro(null);
    try {
      const resultado = await aplicarCupom(pedidoId, codigoCupom);
      setCupomAplicado(resultado);
    } catch (err) {
      setErro((err as Error).message);
    }
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
    } finally {
      setProcessando(false);
    }
  }

  const total = cupomAplicado?.valorTotalComDescontoCentavos ?? pedido?.valorTotalCentavos ?? 0;

  return (
    <div className="tela">
      <h1 className="tela__titulo">Pagamento</h1>
      <p className="tela__subtitulo">Como você prefere pagar?</p>

      <section className="cartao">
        <h2>🏷️ Cupom de desconto</h2>
        <div className="cupom">
          <input
            value={codigoCupom}
            onChange={(e) => setCodigoCupom(e.target.value)}
            placeholder="Código do cupom"
          />
          <BotaoTouch variante="destaque" onClick={aplicar}>
            Aplicar
          </BotaoTouch>
        </div>
        {cupomAplicado && (
          <p className="desconto">Desconto: {formatarCentavos(cupomAplicado.descontoCentavos)}</p>
        )}
      </section>

      {clienteFidelidade && (
        <p className="pontos-fidelidade">
          <span>⭐ Subtotal de pontos de fidelidade</span>
          <strong>{clienteFidelidade.pontos.toLocaleString('pt-BR')} pontos</strong>
        </p>
      )}

      <p className="total">
        <span>Total a pagar</span>
        <strong>{formatarCentavos(total)}</strong>
      </p>

      {erro && <p className="erro">{erro}</p>}

      <section className="formas-pagamento">
        {FORMAS.map((forma) => (
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

      <BotaoTouch onClick={() => irParaEtapa('identificacao')}>Voltar</BotaoTouch>
    </div>
  );
}
