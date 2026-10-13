import type { FormaPagamento, Pedido, ResultadoPagamento } from '@totem/shared';
import type { PagamentoGateway } from '../../integrations/gateway-pagamento';
import {
  config,
  cupons,
  itemDisponivel,
  itensCardapio,
  obterClienteDoPedido,
  obterOuCriarPedido,
  persistir,
  recalcularPedido,
  reservarNumeroPedido,
} from '../../db/memory-store';
import { HttpError } from '../../errors';
import { validarCupom } from '../cupom/cupom.service';
import type { EscolherFormaPagamentoBody } from './pagamento.types';

// Dinheiro é sempre aceito; as demais formas dependem do que o administrador habilitou.
export function formaPagamentoAceita(forma: FormaPagamento): boolean {
  return forma === 'dinheiro' || config.formasPagamento[forma] === true;
}

// Entre montar o carrinho e pagar, o estoque pode ter acabado (outro totem), o cupom
// pode ter vencido/esgotado e o saldo de pontos pode ter mudado. O que deixou de valer
// sai do pedido e o cliente é avisado, em vez de ser cobrado por um valor diferente do
// que viu na tela.
function revalidarPedido(pedido: Pedido): void {
  for (const item of pedido.itens) {
    const itemCardapio = itensCardapio.find((i) => i.id === item.itemCardapioId);
    if (!itemCardapio || !itemDisponivel(itemCardapio)) {
      throw new HttpError(409, `${item.nome} não está mais disponível. Remova-o do carrinho.`);
    }
    if (itemCardapio.estoque !== undefined && item.quantidade > itemCardapio.estoque) {
      throw new HttpError(
        409,
        `Só restam ${itemCardapio.estoque} unidade(s) de ${item.nome}. Ajuste o carrinho.`,
      );
    }
  }

  const cupom = pedido.cupomAplicado ? cupons.get(pedido.cupomAplicado) : undefined;
  if (cupom) {
    try {
      validarCupom(cupom);
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
// habilitados, cliente identificado pelo CPF e — se pontos não somam com cupom — pedido
// sem cupom. O percentual incide sobre o valor efetivamente pago.
function calcularPontosAcumulados(pedido: Pedido): number {
  const { acumuloHabilitado, percentualAcumulo, pontosPorReal, combinaComCupom } = config.fidelidade;
  if (!acumuloHabilitado || (pedido.cupomAplicado && !combinaComCupom)) {
    return 0;
  }
  return Math.floor((pedido.valorAPagarCentavos * percentualAcumulo * pontosPorReal) / 10000);
}

// Efeitos de um pagamento aprovado: baixa de estoque, uso do cupom, débito e crédito
// de pontos e o número que o cliente acompanha até a retirada.
function consolidarPedidoPago(pedido: Pedido, numero: string): void {
  pedido.status = 'pago';
  pedido.numero = numero;

  for (const item of pedido.itens) {
    const itemCardapio = itensCardapio.find((i) => i.id === item.itemCardapioId);
    if (itemCardapio?.estoque !== undefined) {
      itemCardapio.estoque = Math.max(itemCardapio.estoque - item.quantidade, 0);
    }
  }

  const cupom = pedido.cupomAplicado ? cupons.get(pedido.cupomAplicado) : undefined;
  if (cupom) {
    cupom.usos = (cupom.usos ?? 0) + 1;
  }

  const cliente = config.fidelidade.habilitado ? obterClienteDoPedido(pedido) : undefined;
  if (cliente) {
    pedido.pontosAcumulados = calcularPontosAcumulados(pedido);
    cliente.pontos += pedido.pontosAcumulados - (pedido.pontosUsados ?? 0);
  }

  persistir();
}

// US-06: Escolher forma de pagamento — calcula o valor final (considerando cupom e
// pontos, se houver) e delega a cobrança ao gateway. A implementação de
// PagamentoGateway é injetada para permitir troca de provedor sem alterar este
// módulo (ver integrations/gateway-pagamento).
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

  revalidarPedido(pedido);
  // O valor cobrado é sempre o que o totem exibiu por último; se uma regra mudou nesse
  // meio-tempo (ex.: fidelidade desligada pelo administrador), o cliente revê o total.
  const valorExibido = pedido.valorAPagarCentavos;
  recalcularPedido(pedido);
  if (pedido.valorAPagarCentavos !== valorExibido) {
    throw new HttpError(409, 'O total do pedido mudou. Confira o novo valor antes de pagar.');
  }
  // Reservado antes da cobrança: se não houver número livre, o cliente não é cobrado.
  const numero = reservarNumeroPedido();

  const resultado = await gateway.iniciarPagamento({
    pedidoId: pedido.id,
    formaPagamento: body.formaPagamento,
    valorCentavos: pedido.valorAPagarCentavos,
  });

  if (resultado.status === 'autorizado') {
    consolidarPedidoPago(pedido, numero);
  }

  return resultado;
}
