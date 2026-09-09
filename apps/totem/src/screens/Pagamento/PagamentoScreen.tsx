import { useState } from 'react';
import type { FormaPagamento, ResultadoAplicacaoCupom } from '@totem/shared';
import { aplicarCupom, escolherFormaPagamento } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';
import { BotaoTouch } from '../../components/BotaoTouch';

function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const FORMAS: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: 'credito', rotulo: 'Crédito' },
  { valor: 'debito', rotulo: 'Débito' },
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
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
  const { pedidoId, pedido, recarregarPedido, irParaEtapa } = usePedido();

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
      <h1>Pagamento</h1>

      <section>
        <h2>Cupom de desconto</h2>
        <input
          value={codigoCupom}
          onChange={(e) => setCodigoCupom(e.target.value)}
          placeholder="Código do cupom"
        />
        <BotaoTouch onClick={aplicar}>Aplicar</BotaoTouch>
        {cupomAplicado && <p>Desconto: {formatarCentavos(cupomAplicado.descontoCentavos)}</p>}
      </section>

      <p className="carrinho-total">Total a pagar: {formatarCentavos(total)}</p>

      {erro && <p className="erro">{erro}</p>}

      <section className="formas-pagamento">
        {FORMAS.map((forma) => (
          <BotaoTouch key={forma.valor} onClick={() => pagar(forma.valor)} disabled={processando}>
            {forma.rotulo}
          </BotaoTouch>
        ))}
      </section>

      <BotaoTouch onClick={() => irParaEtapa('identificacao')}>Voltar</BotaoTouch>
    </div>
  );
}
