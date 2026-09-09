import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MockEmissorFiscal } from '../../integrations/api-fiscal';
import { MockServicoNotificacao } from '../../integrations/notificacao';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { enviarComprovante } from './comprovante.service';

describe('enviarComprovante', () => {
  it('emite a nota fiscal, notifica o cliente e marca o pedido como finalizado', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'suco-natural', nome: 'Suco Natural', quantidade: 1 },
    });

    const comprovante = await enviarComprovante(
      { pedidoId, canal: 'email', email: 'cliente@teste.com' },
      new MockEmissorFiscal(),
      new MockServicoNotificacao(),
    );

    expect(comprovante.notaFiscalUrl).toMatch(/^https:\/\/mock-fiscal\.local\/danfe\//);

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.status).toBe('finalizado');
  });
});
