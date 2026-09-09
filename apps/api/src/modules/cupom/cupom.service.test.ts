import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../../errors';
import { adicionarItem } from '../carrinho/carrinho.service';
import { aplicarCupom } from './cupom.service';

describe('aplicarCupom', () => {
  it('aplica BEMVINDO10 (10%) sobre o subtotal do carrinho, aceitando código em minúsculas', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });

    const resultado = await aplicarCupom({ pedidoId, codigo: 'bemvindo10' });
    const descontoEsperado = Math.round(1890 * 0.1);
    expect(resultado.descontoCentavos).toBe(descontoEsperado);
    expect(resultado.valorTotalComDescontoCentavos).toBe(1890 - descontoEsperado);
  });

  it('rejeita cupom inexistente', async () => {
    const pedidoId = randomUUID();
    await expect(aplicarCupom({ pedidoId, codigo: 'NAO-EXISTE' })).rejects.toThrow(HttpError);
  });
});
