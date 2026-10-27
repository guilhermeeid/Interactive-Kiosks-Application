import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { itensCardapio } from '../../db/memory-store';
import { MockEmissorFiscal } from '../../integrations/api-fiscal';
import { MockPagamentoGateway } from '../../integrations/gateway-pagamento';
import { listarCardapio } from '../cardapio/cardapio.service';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { registrarConsentimentos } from '../consentimento/consentimento.service';
import { VERSAO_TERMO } from '../consentimento/termo';
import { informarCpfNota } from '../identificacao/identificacao.service';
import { escolherFormaPagamento } from '../pagamento/pagamento.service';
import {
  atualizarProdutoAoVivo,
  cancelarPedidoNoCaixa,
  confirmarEntrega,
  listarPedidosAguardando,
  listarProdutosAoVivo,
  receberPagamentoNoCaixa,
} from './funcionario.service';

const noCardapio = async (id: string) => (await listarCardapio({})).find((item) => item.id === id);

async function pedidoPago(formaPagamento: 'pix' | 'dinheiro', cpfNaNota?: string): Promise<string> {
  const pedidoId = randomUUID();
  await adicionarItem({
    pedidoId,
    item: { itemCardapioId: 'batata-frita', nome: 'Batata Frita', quantidade: 2 },
  });
  if (cpfNaNota) {
    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { cpf_nota: true },
    });
    await informarCpfNota({ pedidoId, cpf: cpfNaNota });
  }
  await escolherFormaPagamento(
    { pedidoId, formaPagamento, consumo: 'viagem' },
    new MockPagamentoGateway(),
  );
  return pedidoId;
}

// Item 7 / US 34: o que o funcionário muda vale na hora.
describe('produtos no modo Funcionário', () => {
  it('marcar como esgotado tira o item de venda na hora; reativar libera na hora', async () => {
    await atualizarProdutoAoVivo('batata-frita', { disponivel: false });
    expect((await noCardapio('batata-frita'))?.disponivel).toBe(false);
    await expect(
      adicionarItem({
        pedidoId: randomUUID(),
        item: { itemCardapioId: 'batata-frita', nome: 'x', quantidade: 1 },
      }),
    ).rejects.toThrow('Item indisponível no momento');

    await atualizarProdutoAoVivo('batata-frita', { disponivel: true });
    expect((await noCardapio('batata-frita'))?.disponivel).toBe(true);
  });

  it('troca preço, descrição e foto na hora, sem remover o produto', async () => {
    const foto = `/imagens/${randomUUID()}.jpg`;
    const atualizado = await atualizarProdutoAoVivo('lanche-classico', {
      precoCentavos: 1990,
      descricao: 'Agora com cheddar',
      imagemUrl: foto,
    });
    expect(atualizado).toMatchObject({
      precoCentavos: 1990,
      descricao: 'Agora com cheddar',
      imagemUrl: foto,
    });
    expect(await noCardapio('lanche-classico')).toMatchObject({
      precoCentavos: 1990,
      imagemUrl: foto,
    });

    await atualizarProdutoAoVivo('lanche-classico', { imagemUrl: null, precoCentavos: 1890 });
    expect((await noCardapio('lanche-classico'))?.imagemUrl).toBeUndefined();
  });

  it('não muda nome, categoria nem estoque, e recusa valores inválidos', async () => {
    await atualizarProdutoAoVivo('suco-natural', {
      nome: 'Outro nome',
      categoria: 'lanches',
      estoque: 99,
    } as never).catch(() => undefined);
    const suco = itensCardapio.find((item) => item.id === 'suco-natural');
    expect(suco).toMatchObject({ nome: 'Suco Natural', categoria: 'bebidas' });
    expect(suco?.estoque).toBeUndefined();

    await expect(atualizarProdutoAoVivo('suco-natural', { precoCentavos: -1 })).rejects.toThrow(
      /Preço/,
    );
    await expect(
      atualizarProdutoAoVivo('suco-natural', { imagemUrl: 'https://exemplo.com/x.jpg' }),
    ).rejects.toThrow(/Imagem inválida/);
    await expect(atualizarProdutoAoVivo('nao-existe', { disponivel: true })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('a lista mostra se cada item está à venda no totem (combos seguem os itens)', async () => {
    const lista = await listarProdutosAoVivo();
    expect(lista.find((item) => item.id === 'suco-natural')?.disponivelNoTotem).toBe(false);
    expect(lista.find((item) => item.id === 'lanche-duplo')?.disponivelNoTotem).toBe(true);
  });
});

// Item 2: caixa e balcão.
describe('pedidos no modo Funcionário', () => {
  it('pedido em dinheiro aparece aguardando o caixa, com o CPF da nota para o atendente', async () => {
    const pedidoId = await pedidoPago('dinheiro', '11144477735');
    const pedido = (await listarPedidosAguardando()).find((p) => p.id === pedidoId);
    expect(pedido).toMatchObject({
      status: 'aguardando_pagamento',
      formaPagamento: 'dinheiro',
      consumo: 'viagem',
      cpfNaNota: '11144477735',
      itens: [{ nome: 'Batata Frita', quantidade: 2 }],
    });
    expect(pedido?.notaFiscalUrl).toBeUndefined();
  });

  it('receber no caixa emite a nota ali, com o CPF; depois o CPF some da lista', async () => {
    const pedidoId = await pedidoPago('dinheiro', '12345678909');
    const { notaFiscalUrl } = await receberPagamentoNoCaixa(pedidoId, new MockEmissorFiscal());
    expect(notaFiscalUrl).toMatch(/danfe/);

    const pedido = (await listarPedidosAguardando()).find((p) => p.id === pedidoId);
    expect(pedido).toMatchObject({ status: 'finalizado', notaFiscalUrl });
    expect(pedido?.cpfNaNota).toBeUndefined();
  });

  it('pedido em dinheiro só é entregue depois de pago no caixa', async () => {
    const pedidoId = await pedidoPago('dinheiro');
    await expect(confirmarEntrega(pedidoId)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Receba o pagamento no caixa antes de entregar',
    });
    await receberPagamentoNoCaixa(pedidoId, new MockEmissorFiscal());
    await confirmarEntrega(pedidoId);
    expect((await listarPedidosAguardando()).some((p) => p.id === pedidoId)).toBe(false);
  });

  it('cancelar no caixa tira o pedido da lista e libera o número', async () => {
    const pedidoId = await pedidoPago('dinheiro');
    await cancelarPedidoNoCaixa(pedidoId);
    expect((await obterCarrinho(pedidoId)).status).toBe('cancelado');
    expect((await listarPedidosAguardando()).some((p) => p.id === pedidoId)).toBe(false);
  });

  it('pedido pago no totem vai direto para a retirada', async () => {
    const pedidoId = await pedidoPago('pix');
    expect((await listarPedidosAguardando()).find((p) => p.id === pedidoId)?.status).toBe('pago');
    await confirmarEntrega(pedidoId);
    await expect(confirmarEntrega(pedidoId)).rejects.toMatchObject({ statusCode: 404 });
  });
});
