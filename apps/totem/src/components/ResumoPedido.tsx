import type { Pedido } from '@totem/shared';
import { formatarCentavos } from '../utils/formatarMoeda';

// Valores do pedido, todos calculados no servidor: o total antes, cada desconto em linha
// própria ("− valor") e o total a pagar.
export function ResumoPedido({ pedido }: { pedido: Pedido | null }) {
  const descontoCupom = pedido?.descontoCupomCentavos ?? 0;
  const descontoPontos = pedido?.descontoPontosCentavos ?? 0;
  return (
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
  );
}
