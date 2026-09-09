import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MockPagamentoGateway } from '../../integrations/gateway-pagamento';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { aplicarCupom } from '../cupom/cupom.service';
import { escolherFormaPagamento } from './pagamento.service';

describe('escolherFormaPagamento', () => {
  it('cobra o valor com desconto do cupom aplicado e marca o pedido como pago', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });
    await aplicarCupom({ pedidoId, codigo: 'BEMVINDO10' });

    const resultado = await escolherFormaPagamento(
      { pedidoId, formaPagamento: 'pix' },
      new MockPagamentoGateway(),
    );

    expect(resultado.status).toBe('autorizado');
    expect(resultado.valorCentavos).toBe(1890 - Math.round(1890 * 0.1));

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.status).toBe('pago');
  });
});
