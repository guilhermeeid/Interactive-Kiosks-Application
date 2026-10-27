import type { ItemCardapio, PedidoAguardandoRetirada } from '@totem/shared';
import {
  comprovantes,
  itemDisponivel,
  itensCardapio,
  pedidoAguardaRetirada,
  pedidos,
  persistir,
} from '../../db/memory-store';
import { HttpError } from '../../errors';
import type { EmissorFiscal } from '../../integrations/api-fiscal';
import type { ProdutoAoVivoBody } from '../admin/admin.types';
import { booleano, imagemOpcional, inteiro, texto } from '../admin/validacao';
import { dispensarComprovante } from '../comprovante/comprovante.service';
import { cancelarNoCaixa, receberNoCaixa } from '../pagamento/pagamento.service';

// Modo Funcionário (item 7): o que muda aqui vale na hora — os totens enxergam na
// próxima releitura do cardápio (até 30 segundos) e a API já aplica na mesma hora.
// O funcionário só marca itens como esgotados e troca preço, foto e descrição; não cria
// nem remove produtos.

export type ProdutoAoVivo = ItemCardapio & { disponivelNoTotem: boolean };

// Produtos como estão em vigor agora. `disponivelNoTotem` considera estoque e, nos
// combos, os itens que os compõem (um combo esgota junto com qualquer item dele).
export async function listarProdutosAoVivo(): Promise<ProdutoAoVivo[]> {
  return itensCardapio.map((item) => ({ ...item, disponivelNoTotem: itemDisponivel(item) }));
}

export async function atualizarProdutoAoVivo(
  id: string,
  body: ProdutoAoVivoBody,
): Promise<ProdutoAoVivo> {
  const item = itensCardapio.find((produto) => produto.id === id);
  if (!item) {
    throw new HttpError(404, 'Produto não encontrado');
  }
  const mudancas: Partial<ItemCardapio> = {};
  if (body?.disponivel !== undefined) {
    mudancas.disponivel = booleano(body.disponivel, 'Disponível');
  }
  if (body?.precoCentavos !== undefined) {
    mudancas.precoCentavos = inteiro(body.precoCentavos, 'Preço', 0, 10_000_000);
  }
  if (body?.descricao !== undefined) {
    mudancas.descricao = texto(body.descricao, 'Descrição', 200, false);
  }
  const trocaFoto = body?.imagemUrl !== undefined;
  const foto = trocaFoto ? imagemOpcional(body.imagemUrl, 'Foto') : undefined;
  if (Object.keys(mudancas).length === 0 && !trocaFoto) {
    throw new HttpError(400, 'Nada para alterar');
  }

  Object.assign(item, mudancas);
  if (trocaFoto) {
    if (foto) {
      item.imagemUrl = foto;
    } else {
      delete item.imagemUrl;
    }
  }
  persistir();
  return { ...item, disponivelNoTotem: itemDisponivel(item) };
}

// ---------- Pedidos: caixa e balcão ----------

// O que o caixa e o balcão precisam ver. O CPF só aparece no pedido que espera
// pagamento em dinheiro: é o atendente quem emite essa nota, com o CPF que o cliente
// consentiu em usar.
export async function listarPedidosAguardando(): Promise<PedidoAguardandoRetirada[]> {
  return [...pedidos.values()]
    .filter(pedidoAguardaRetirada)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
    .map((pedido) => ({
      id: pedido.id,
      numero: pedido.numero as string,
      status: pedido.status,
      formaPagamento: pedido.formaPagamento,
      consumo: pedido.consumo,
      itens: pedido.itens.map(({ nome, quantidade }) => ({ nome, quantidade })),
      valorAPagarCentavos: pedido.valorAPagarCentavos,
      criadoEm: pedido.criadoEm,
      cpfNaNota: pedido.status === 'aguardando_pagamento' ? pedido.cpfNaNota : undefined,
      notaFiscalUrl: comprovantes.get(pedido.id)?.notaFiscalUrl,
    }));
}

// Item 2: o cliente pagou em dinheiro no caixa. O pedido vira pago (os pontos entram) e
// a nota fiscal é emitida ali, com o CPF do pedido, para o atendente imprimir.
export async function receberPagamentoNoCaixa(
  pedidoId: string,
  emissorFiscal: EmissorFiscal,
): Promise<{ notaFiscalUrl?: string }> {
  await receberNoCaixa(pedidoId);
  const comprovante = await dispensarComprovante({ pedidoId }, emissorFiscal);
  return { notaFiscalUrl: comprovante.notaFiscalUrl };
}

// O cliente não apareceu no caixa: cancela e devolve estoque, cupom e pontos.
export async function cancelarPedidoNoCaixa(pedidoId: string): Promise<void> {
  await cancelarNoCaixa(pedidoId);
}

// O "ok" do balcão: o pedido foi entregue e o número dele volta a ficar livre.
export async function confirmarEntrega(pedidoId: string): Promise<void> {
  const pedido = pedidos.get(pedidoId);
  if (!pedido || !pedidoAguardaRetirada(pedido)) {
    throw new HttpError(404, 'Pedido não está aguardando retirada');
  }
  if (pedido.status === 'aguardando_pagamento') {
    throw new HttpError(409, 'Receba o pagamento no caixa antes de entregar');
  }
  pedido.entregueEm = new Date().toISOString();
  persistir();
}
