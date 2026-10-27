import type {
  ConsumoPedido,
  FormaPagamento,
  Pedido,
  ResultadoPagamento,
} from '@totem/shared';
import type { PagamentoGateway } from '../../integrations/gateway-pagamento';
import {
  config,
  cupons,
  demandaPorItem,
  itemDisponivel,
  itemSemEstoque,
  obterClienteDoPedido,
  obterItem,
  obterOuCriarPedido,
  pedidos,
  persistir,
  recalcularPedido,
  reservarNumeroPedido,
} from '../../db/memory-store';
import { HttpError } from '../../errors';
import { validarCupomNoPedido } from '../cupom/cupom.service';
import type { EscolherFormaPagamentoBody } from './pagamento.types';

// Cada forma (inclusive dinheiro) só é aceita se o administrador a deixou ligada.
export function formaPagamentoAceita(forma: FormaPagamento): boolean {
  return config.formasPagamento[forma] === true;
}

// "Para comer aqui" ou "Para levar": obrigatório escolher quando a loja oferece os dois;
// com uma opção só, é ela.
function definirConsumo(consumo: unknown): ConsumoPedido {
  const { local, viagem } = config.consumo;
  if (local && viagem) {
    if (consumo !== 'local' && consumo !== 'viagem') {
      throw new HttpError(400, 'Escolha se o pedido é para comer aqui ou para levar');
    }
    return consumo;
  }
  return local ? 'local' : 'viagem';
}

// Entre montar o carrinho e pagar, o estoque pode ter acabado (outro totem), o cupom
// pode ter vencido/esgotado e o saldo de pontos pode ter mudado. O que deixou de valer
// sai do pedido e o cliente é avisado, em vez de ser cobrado por um valor diferente do
// que viu na tela.
function revalidarPedido(pedido: Pedido): void {
  for (const linha of pedido.itens) {
    const item = obterItem(linha.itemCardapioId);
    if (!item || !itemDisponivel(item)) {
      throw new HttpError(409, `${linha.nome} não está mais disponível. Remova-o do carrinho.`);
    }
  }
  const falta = itemSemEstoque(demandaPorItem(pedido.itens));
  if (falta) {
    throw new HttpError(
      409,
      `Só restam ${falta.restam} unidade(s) de ${falta.item.nome}. Ajuste o carrinho.`,
    );
  }

  const cupom = pedido.cupomAplicado ? cupons.get(pedido.cupomAplicado) : undefined;
  if (cupom) {
    try {
      validarCupomNoPedido(cupom, pedido);
    } catch (err) {
      pedido.cupomAplicado = undefined;
      recalcularPedido(pedido);
      throw new HttpError(409, `${(err as Error).message}. O total foi atualizado.`);
    }
  }

  const saldo = obterClienteDoPedido(pedido)?.pontos ?? 0;
  if ((pedido.pontosUsados ?? 0) > saldo) {
    pedido.pontosUsados = undefined;
    recalcularPedido(pedido);
    throw new HttpError(409, 'Seu saldo de pontos mudou. O total foi atualizado.');
  }
}

// Pontos que o pedido rende, conforme as regras do administrador: programa e acúmulo
// habilitados, cliente identificado e — se pontos não somam com cupom — pedido sem
// cupom. O percentual incide sobre o valor efetivamente pago.
function calcularPontosAcumulados(pedido: Pedido): number {
  const { acumuloHabilitado, percentualAcumulo, pontosPorReal, combinaComCupom } = config.fidelidade;
  if (!acumuloHabilitado || (pedido.cupomAplicado && !combinaComCupom)) {
    return 0;
  }
  return Math.floor((pedido.valorAPagarCentavos * percentualAcumulo * pontosPorReal) / 10000);
}

function clienteComFidelidade(pedido: Pedido) {
  return config.fidelidade.habilitado ? obterClienteDoPedido(pedido) : undefined;
}

// Segura o que o pedido consome assim que ele sai do totem: estoque (combos baixam os
// itens que os compõem), o uso do cupom, os pontos resgatados e o número de retirada.
function reservarPedido(pedido: Pedido, numero: string, forma: FormaPagamento): void {
  pedido.numero = numero;
  pedido.formaPagamento = forma;

  for (const [id, unidades] of demandaPorItem(pedido.itens)) {
    const item = obterItem(id);
    if (item?.estoque !== undefined) {
      item.estoque = Math.max(item.estoque - unidades, 0);
    }
  }
  const cupom = pedido.cupomAplicado ? cupons.get(pedido.cupomAplicado) : undefined;
  if (cupom) {
    cupom.usos = (cupom.usos ?? 0) + 1;
  }
  const cliente = clienteComFidelidade(pedido);
  if (cliente) {
    cliente.pontos -= pedido.pontosUsados ?? 0;
  }
}

// Pagamento confirmado (no terminal ou no caixa): o pedido vira pago e os pontos
// acumulados entram no saldo do cliente.
function confirmarPagamento(pedido: Pedido): void {
  pedido.status = 'pago';
  pedido.pontosPrevistos = undefined;
  const cliente = clienteComFidelidade(pedido);
  if (cliente) {
    pedido.pontosAcumulados = calcularPontosAcumulados(pedido);
    cliente.pontos += pedido.pontosAcumulados;
  }
}

// US-06: Escolher forma de pagamento — calcula o valor final (considerando cupom e
// pontos, se houver) e delega a cobrança ao gateway. A implementação de
// PagamentoGateway é injetada para permitir troca de provedor sem alterar este
// módulo (ver integrations/gateway-pagamento).
// Dinheiro não passa pelo gateway: o totem reserva o pedido e manda o cliente ao caixa,
// onde o atendente recebe, confirma e emite a nota (ver receberNoCaixa).
export async function escolherFormaPagamento(
  body: EscolherFormaPagamentoBody,
  gateway: PagamentoGateway,
): Promise<ResultadoPagamento> {
  const pedido = obterOuCriarPedido(body.pedidoId);
  if (pedido.status !== 'em_montagem') {
    throw new HttpError(409, 'Este pedido já foi pago');
  }
  if (pedido.itens.length === 0) {
    throw new HttpError(400, 'O carrinho está vazio');
  }
  if (!formaPagamentoAceita(body.formaPagamento)) {
    throw new HttpError(400, 'Forma de pagamento indisponível');
  }
  const consumo = definirConsumo(body.consumo);

  revalidarPedido(pedido);
  // O valor cobrado é sempre o que o totem exibiu por último; se uma regra mudou nesse
  // meio-tempo, o cliente revê o total.
  const valorExibido = pedido.valorAPagarCentavos;
  recalcularPedido(pedido);
  if (pedido.valorAPagarCentavos !== valorExibido) {
    throw new HttpError(409, 'O total do pedido mudou. Confira o novo valor antes de pagar.');
  }
  pedido.consumo = consumo;
  // Reservado antes da cobrança: se não houver número livre, o cliente não é cobrado.
  const numero = reservarNumeroPedido();

  if (body.formaPagamento === 'dinheiro') {
    reservarPedido(pedido, numero, 'dinheiro');
    pedido.status = 'aguardando_pagamento';
    pedido.pontosPrevistos = clienteComFidelidade(pedido)
      ? calcularPontosAcumulados(pedido)
      : undefined;
    persistir();
    return {
      transacaoId: `caixa-${pedido.id}`,
      formaPagamento: 'dinheiro',
      status: 'pendente',
      valorCentavos: pedido.valorAPagarCentavos,
    };
  }

  const resultado = await gateway.iniciarPagamento({
    pedidoId: pedido.id,
    formaPagamento: body.formaPagamento,
    valorCentavos: pedido.valorAPagarCentavos,
  });

  if (resultado.status === 'autorizado') {
    reservarPedido(pedido, numero, body.formaPagamento);
    confirmarPagamento(pedido);
    persistir();
  }

  return resultado;
}

function pedidoNoCaixa(pedidoId: string): Pedido {
  const pedido = pedidos.get(pedidoId);
  if (!pedido || pedido.status !== 'aguardando_pagamento') {
    throw new HttpError(404, 'Pedido não está aguardando pagamento no caixa');
  }
  return pedido;
}

// Caixa recebeu o dinheiro: o pedido vira pago e os pontos entram no saldo. A nota é
// emitida em seguida, no caixa (ver modules/funcionario).
export async function receberNoCaixa(pedidoId: string): Promise<Pedido> {
  const pedido = pedidoNoCaixa(pedidoId);
  confirmarPagamento(pedido);
  persistir();
  return pedido;
}

// O cliente não foi ao caixa: o pedido é cancelado e o que ele reservou volta — estoque,
// uso do cupom, pontos resgatados e o número de retirada.
export async function cancelarNoCaixa(pedidoId: string): Promise<Pedido> {
  const pedido = pedidoNoCaixa(pedidoId);
  for (const [id, unidades] of demandaPorItem(pedido.itens)) {
    const item = obterItem(id);
    if (item?.estoque !== undefined) {
      item.estoque += unidades;
    }
  }
  const cupom = pedido.cupomAplicado ? cupons.get(pedido.cupomAplicado) : undefined;
  if (cupom?.usos) {
    cupom.usos -= 1;
  }
  const cliente = clienteComFidelidade(pedido);
  if (cliente) {
    cliente.pontos += pedido.pontosUsados ?? 0;
  }
  pedido.status = 'cancelado';
  pedido.pontosPrevistos = undefined;
  persistir();
  return pedido;
}
