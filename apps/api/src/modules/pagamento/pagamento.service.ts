import type {
  CobrancaPix,
  ConsumoPedido,
  FormaPagamento,
  Pedido,
  ResultadoPagamento,
  SituacaoPix,
} from '@totem/shared';
import type { EmissorFiscal } from '../../integrations/api-fiscal';
import type { PagamentoGateway } from '../../integrations/gateway-pagamento';
import {
  emissorFiscal as emissorPadrao,
  gatewayPagamento as gatewayPadrao,
} from '../../integrations/instancias';
import { loadEnv } from '../../config/env';
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
  registrarVenda,
  reservarNumeroPedido,
} from '../../db/memory-store';
import { HttpError } from '../../errors';
import { ErroTempoEsgotado, comTempoLimite } from '../../tempo-limite';
import { emitirNotaDoPedido } from '../comprovante/comprovante.service';
import { validarCupomNoPedido } from '../cupom/cupom.service';
import { vendaDoPedido } from '../relatorio/relatorio.service';
import type { EscolherFormaPagamentoBody } from './pagamento.types';

// Cada forma (inclusive dinheiro) só é aceita se o administrador a deixou ligada.
export function formaPagamentoAceita(forma: FormaPagamento): boolean {
  return config.formasPagamento[forma] === true;
}

function pedidoPago(pedido: Pedido): boolean {
  return pedido.status === 'pago' || pedido.status === 'finalizado';
}

// ---------- Trava por pedido ----------
// Pix tem várias fontes de mudança simultâneas (o totem consultando, o webhook do banco,
// a varredura de QR expirados, o cliente cancelando). As operações de um mesmo pedido
// rodam uma de cada vez, para uma reserva nunca ser desfeita (ou feita) duas vezes.
const travas = new Map<string, Promise<unknown>>();

function comTrava<T>(pedidoId: string, operacao: () => Promise<T>): Promise<T> {
  const anterior = travas.get(pedidoId) ?? Promise.resolve();
  const atual = anterior.catch(() => undefined).then(operacao);
  travas.set(pedidoId, atual);
  atual
    .finally(() => {
      if (travas.get(pedidoId) === atual) travas.delete(pedidoId);
    })
    .catch(() => undefined);
  return atual;
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
  const { acumuloHabilitado, percentualAcumulo, pontosPorReal, combinaComCupom } =
    config.fidelidade;
  if (!acumuloHabilitado || (pedido.cupomAplicado && !combinaComCupom)) {
    return 0;
  }
  return Math.floor((pedido.valorAPagarCentavos * percentualAcumulo * pontosPorReal) / 10000);
}

function clienteComFidelidade(pedido: Pedido) {
  return config.fidelidade.habilitado ? obterClienteDoPedido(pedido) : undefined;
}

// ---------- Reserva ----------

// Segura o que o pedido consome assim que o pagamento começa (QR Pix na tela, pedido no
// caixa ou cartão aprovado): estoque (combos baixam os itens que os compõem), o uso do
// cupom, os pontos resgatados e o número de retirada.
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
    cliente.pontos = Math.max(cliente.pontos - (pedido.pontosUsados ?? 0), 0);
  }
}

// Desfaz a reserva (pagamento cancelado ou QR expirado): estoque, uso do cupom e pontos
// resgatados voltam; os pontos que o pedido renderia (`pontosPrevistos`) não entram.
function liberarReserva(pedido: Pedido): void {
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
  pedido.pontosPrevistos = undefined;
}

// Pagamento confirmado (no terminal, pelo banco no Pix ou no caixa): o pedido vira pago,
// os pontos acumulados entram no saldo do cliente e a venda entra no histórico (US 25).
function confirmarPagamento(pedido: Pedido, transacaoId?: string): void {
  pedido.status = 'pago';
  pedido.pagoEm = new Date().toISOString();
  pedido.transacaoId = transacaoId;
  pedido.pontosPrevistos = undefined;
  const cliente = clienteComFidelidade(pedido);
  if (cliente) {
    pedido.pontosAcumulados = calcularPontosAcumulados(pedido);
    cliente.pontos += pedido.pontosAcumulados;
  }
  registrarVenda(vendaDoPedido(pedido, new Date()));
}

// ---------- Escolha da forma de pagamento ----------

// US-06: Escolher forma de pagamento — calcula o valor final (considerando cupom e
// pontos, se houver) e delega a cobrança ao gateway. A implementação de
// PagamentoGateway é injetada para permitir troca de provedor sem alterar este
// módulo (ver integrations/gateway-pagamento).
// - Cartão e vale: aprovação na hora; a NFC-e é emitida em seguida (US 15).
// - Pix (US 11): gera o QR Code dinâmico e reserva o pedido; a confirmação chega pelo
//   webhook do banco. Repetir a chamada com o QR ainda válido devolve o mesmo QR (o
//   totem pode tentar de novo depois de uma queda de conexão sem gerar outra cobrança);
//   com o QR expirado, gera um novo, com o carrinho intacto.
// - Dinheiro não passa pelo gateway: o totem reserva o pedido e manda o cliente ao
//   caixa, onde o atendente recebe, confirma e emite a nota (ver receberNoCaixa).
export async function escolherFormaPagamento(
  body: EscolherFormaPagamentoBody,
  gateway: PagamentoGateway = gatewayPadrao,
  emissor: EmissorFiscal = emissorPadrao,
): Promise<ResultadoPagamento> {
  const pedido = obterOuCriarPedido(body.pedidoId);
  return comTrava(pedido.id, async () => {
    if (pedido.status === 'aguardando_pix') {
      if (body.formaPagamento !== 'pix') {
        throw new HttpError(409, 'Há um Pix em andamento. Cancele-o para escolher outra forma.');
      }
      await atualizarPix(pedido, gateway, emissor, true);
      if (pedido.status === 'aguardando_pix') {
        return resultadoPix(pedido);
      }
    }
    // Nova tentativa depois de uma queda de conexão: o pagamento já tinha passado.
    if (pedidoPago(pedido) && pedido.formaPagamento === body.formaPagamento) {
      return resultadoAutorizado(pedido);
    }
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

    if (body.formaPagamento === 'pix') {
      return iniciarPix(pedido, numero, gateway);
    }

    const resultado = await gateway.iniciarPagamento({
      pedidoId: pedido.id,
      formaPagamento: body.formaPagamento,
      valorCentavos: pedido.valorAPagarCentavos,
    });

    if (resultado.status === 'autorizado') {
      reservarPedido(pedido, numero, body.formaPagamento);
      confirmarPagamento(pedido, resultado.transacaoId);
      persistir();
      // US 15: pagamento aprovado autoriza a NFC-e. Uma falha fiscal não desfaz a venda.
      await emitirNotaDoPedido(pedido, emissor);
    }

    return resultado;
  });
}

function resultadoAutorizado(pedido: Pedido): ResultadoPagamento {
  return {
    transacaoId: pedido.transacaoId ?? pedido.id,
    formaPagamento: pedido.formaPagamento as FormaPagamento,
    status: 'autorizado',
    valorCentavos: pedido.valorAPagarCentavos,
    autorizadoEm: pedido.pagoEm,
  };
}

// ---------- Pix ----------

function resultadoPix(pedido: Pedido): ResultadoPagamento {
  const pix = pedido.pix as CobrancaPix;
  return {
    transacaoId: pix.transacaoId,
    formaPagamento: 'pix',
    status: 'pendente',
    valorCentavos: pix.valorCentavos,
    pix,
  };
}

// Volta o pedido ao carrinho, com tudo o que estava reservado de volta.
function encerrarPix(pedido: Pedido, status: 'expirada' | 'cancelada'): void {
  liberarReserva(pedido);
  pedido.numero = undefined;
  pedido.formaPagamento = undefined;
  pedido.status = 'em_montagem';
  if (pedido.pix) {
    pedido.pix = { ...pedido.pix, status };
  }
  recalcularPedido(pedido);
  persistir();
}

async function iniciarPix(
  pedido: Pedido,
  numero: string,
  gateway: PagamentoGateway,
): Promise<ResultadoPagamento> {
  const { pixExpiracaoSegundos, pixTempoLimiteMs } = loadEnv();
  // Reservado antes de falar com o banco, para o estoque e os pontos não serem usados por
  // outro totem enquanto o cliente paga.
  reservarPedido(pedido, numero, 'pix');
  pedido.status = 'aguardando_pix';
  pedido.pix = undefined;
  // Mesmo pedido, mesma tentativa e mesmo valor = mesma cobrança no banco. Se a resposta
  // se perder, a próxima tentativa recebe o QR que o banco já tinha criado.
  const sequencia = (pedido.pixSequencia ?? 0) + 1;
  const chaveIdempotencia = `${pedido.id}:${sequencia}:${pedido.valorAPagarCentavos}`;

  try {
    const cobranca = await comTempoLimite(
      gateway.criarCobrancaPix({
        pedidoId: pedido.id,
        valorCentavos: pedido.valorAPagarCentavos,
        expiraEmSegundos: pixExpiracaoSegundos,
        chaveIdempotencia,
      }),
      pixTempoLimiteMs,
      'O banco não respondeu a tempo',
    );
    pedido.pixSequencia = sequencia;
    pedido.transacoesPix = [...new Set([...(pedido.transacoesPix ?? []), cobranca.transacaoId])];
    pedido.pix = {
      transacaoId: cobranca.transacaoId,
      copiaECola: cobranca.copiaECola,
      valorCentavos: cobranca.valorCentavos,
      criadaEm: new Date().toISOString(),
      expiraEm: cobranca.expiraEm,
      status: 'pendente',
    };
    pedido.pontosPrevistos = clienteComFidelidade(pedido)
      ? calcularPontosAcumulados(pedido)
      : undefined;
    persistir();
    return resultadoPix(pedido);
  } catch (err) {
    encerrarPix(pedido, 'cancelada');
    pedido.pix = undefined;
    if (err instanceof ErroTempoEsgotado) {
      throw new HttpError(
        504,
        'Conexão instável com o banco: o QR Code do Pix não pôde ser gerado. ' +
          'Seu carrinho foi mantido. Tente de novo.',
      );
    }
    throw new HttpError(
      502,
      'Não foi possível gerar o QR Code do Pix agora. Seu carrinho foi mantido. Tente de novo.',
    );
  }
}

async function consultarBanco(
  gateway: PagamentoGateway,
  transacaoId: string,
): Promise<ResultadoPagamento | undefined> {
  try {
    return await comTempoLimite(
      gateway.consultarStatus(transacaoId),
      loadEnv().pixTempoLimiteMs,
      'O banco não respondeu a tempo',
    );
  } catch {
    return undefined; // instável: decide-se pelo prazo, e o webhook concilia depois
  }
}

// Última consulta ao banco de cada pedido com Pix na tela, para conferir o status de vez
// em quando mesmo sem webhook (aviso perdido), sem consultar a cada segundo.
const ultimaConsultaBanco = new Map<string, number>();
const INTERVALO_CONSULTA_BANCO_MS = 10_000;

// Atualiza a cobrança Pix do pedido: confirmada no banco → pago; prazo vencido → QR
// expirado e reserva desfeita. Roda dentro da trava do pedido.
async function atualizarPix(
  pedido: Pedido,
  gateway: PagamentoGateway,
  emissor: EmissorFiscal,
  forcarConsulta = false,
): Promise<void> {
  if (pedido.status !== 'aguardando_pix' || !pedido.pix) {
    return;
  }
  const agora = Date.now();
  const expirou = Date.parse(pedido.pix.expiraEm) <= agora;
  const ultima = ultimaConsultaBanco.get(pedido.id) ?? 0;
  if (!expirou && !forcarConsulta && agora - ultima < INTERVALO_CONSULTA_BANCO_MS) {
    return;
  }
  ultimaConsultaBanco.set(pedido.id, agora);

  const transacaoId = pedido.pix.transacaoId;
  const resultado = await consultarBanco(gateway, transacaoId);
  if (resultado?.status === 'autorizado') {
    await conciliarNoPedido(pedido, transacaoId, resultado, gateway, emissor);
    return;
  }
  if (expirou) {
    // Cancela no banco para o QR vencido não aceitar mais pagamento; se ainda assim um
    // pagamento chegar, é conciliado (ou estornado) pelo webhook.
    await gateway.cancelarCobranca(transacaoId).catch(() => undefined);
    encerrarPix(pedido, 'expirada');
    ultimaConsultaBanco.delete(pedido.id);
  }
}

function situacao(pedido: Pedido): SituacaoPix {
  const restante = pedido.pix ? Date.parse(pedido.pix.expiraEm) - Date.now() : 0;
  return {
    statusPedido: pedido.status,
    pix: pedido.pix,
    segundosRestantes:
      pedido.status === 'aguardando_pix' ? Math.max(Math.ceil(restante / 1000), 0) : 0,
  };
}

// O que o totem consulta enquanto o QR está na tela (a cada poucos segundos).
export async function consultarPix(
  pedidoId: string,
  gateway: PagamentoGateway = gatewayPadrao,
  emissor: EmissorFiscal = emissorPadrao,
): Promise<SituacaoPix> {
  const pedido = pedidos.get(pedidoId);
  if (!pedido) {
    throw new HttpError(404, 'Pedido não encontrado');
  }
  return comTrava(pedido.id, async () => {
    await atualizarPix(pedido, gateway, emissor);
    return situacao(pedido);
  });
}

// O cliente desistiu do Pix (outra forma de pagamento ou voltar ao carrinho): a cobrança
// é cancelada no banco e a reserva desfeita. Se o banco já tinha recebido, o pedido
// segue pago — nunca se cancela um Pix pago.
export async function cancelarPix(
  pedidoId: string,
  gateway: PagamentoGateway = gatewayPadrao,
  emissor: EmissorFiscal = emissorPadrao,
): Promise<SituacaoPix> {
  const pedido = pedidos.get(pedidoId);
  if (!pedido) {
    throw new HttpError(404, 'Pedido não encontrado');
  }
  return comTrava(pedido.id, async () => {
    if (pedido.status !== 'aguardando_pix' || !pedido.pix) {
      return situacao(pedido);
    }
    const transacaoId = pedido.pix.transacaoId;
    const resultado = await consultarBanco(gateway, transacaoId);
    if (resultado?.status === 'autorizado') {
      await conciliarNoPedido(pedido, transacaoId, resultado, gateway, emissor);
      return situacao(pedido);
    }
    await gateway.cancelarCobranca(transacaoId).catch(() => undefined);
    encerrarPix(pedido, 'cancelada');
    return situacao(pedido);
  });
}

async function estornarPix(gateway: PagamentoGateway, transacaoId: string, motivo: string) {
  console.warn(`[pix] Estornando a transação ${transacaoId}: ${motivo}`);
  await gateway
    .estornar(transacaoId)
    .catch((err: Error) =>
      console.error(`[pix] Falha ao estornar ${transacaoId}: ${err.message}. Estorne manualmente.`),
    );
}

// Concilia um Pix pago com o pedido dele, sem nunca cobrar o cliente duas vezes:
// - QR atual pago: o pedido vira pago.
// - QR anterior (já expirado) pago — a confirmação atrasada: se o valor é o do pedido e
//   ele ainda não foi pago, este pagamento vale; o QR atual é cancelado e, se o pedido
//   tinha voltado ao carrinho, a reserva é refeita.
// - Pedido já pago por outra transação (o cliente pagou dois QR) ou valor que não
//   corresponde mais ao pedido: o pagamento é estornado.
async function conciliarNoPedido(
  pedido: Pedido,
  transacaoId: string,
  resultado: ResultadoPagamento,
  gateway: PagamentoGateway,
  emissor: EmissorFiscal,
): Promise<void> {
  if (pedido.transacaoId === transacaoId) {
    return; // aviso repetido do banco
  }
  if (pedidoPago(pedido) || pedido.status === 'cancelado') {
    await estornarPix(
      gateway,
      transacaoId,
      `pedido ${pedido.numero ?? pedido.id} já pago/cancelado`,
    );
    return;
  }
  const valor = resultado.valorCentavos;
  const pixAtual = pedido.pix;

  if (pedido.status === 'aguardando_pix') {
    if (pixAtual && pixAtual.transacaoId !== transacaoId) {
      if (valor !== pixAtual.valorCentavos) {
        await estornarPix(gateway, transacaoId, 'valor de um QR antigo diferente do pedido atual');
        return;
      }
      await gateway.cancelarCobranca(pixAtual.transacaoId).catch(() => undefined);
      pedido.conciliadoComAtraso = true;
    }
  } else if (pedido.status === 'em_montagem') {
    recalcularPedido(pedido);
    if (pedido.itens.length === 0 || valor !== pedido.valorAPagarCentavos) {
      await estornarPix(gateway, transacaoId, 'o pedido mudou depois que o QR expirou');
      return;
    }
    let numero: string;
    try {
      numero = reservarNumeroPedido();
    } catch {
      await estornarPix(gateway, transacaoId, 'sem número de pedido livre');
      return;
    }
    reservarPedido(pedido, numero, 'pix');
    pedido.conciliadoComAtraso = true;
  } else if (pedido.status === 'aguardando_pagamento') {
    // Foi para o caixa depois que o QR expirou, mas o Pix acabou entrando: vale o Pix.
    if (valor !== pedido.valorAPagarCentavos) {
      await estornarPix(gateway, transacaoId, 'valor diferente do pedido no caixa');
      return;
    }
    pedido.formaPagamento = 'pix';
    pedido.conciliadoComAtraso = true;
  }

  if (pixAtual) {
    pedido.pix = { ...pixAtual, transacaoId, valorCentavos: valor, status: 'paga' };
  }
  confirmarPagamento(pedido, transacaoId);
  persistir();
  ultimaConsultaBanco.delete(pedido.id);
  console.info(
    `[pix] Pedido ${pedido.numero} pago pela transação ${transacaoId}` +
      (pedido.conciliadoComAtraso ? ' (confirmação atrasada, conciliada)' : ''),
  );
  await emitirNotaDoPedido(pedido, emissor);
}

// Webhook do banco: uma cobrança Pix mudou. O aviso não é prova de pagamento — o status
// é sempre conferido no banco antes de o pedido avançar.
export async function processarNotificacaoPix(
  transacaoId: string,
  gateway: PagamentoGateway = gatewayPadrao,
  emissor: EmissorFiscal = emissorPadrao,
): Promise<void> {
  const resultado = await gateway.consultarStatus(transacaoId);
  if (resultado.status !== 'autorizado') {
    return;
  }
  const pedido = [...pedidos.values()].find((p) => p.transacoesPix?.includes(transacaoId));
  if (!pedido) {
    await estornarPix(gateway, transacaoId, 'nenhum pedido com esta cobrança');
    return;
  }
  await comTrava(pedido.id, () =>
    conciliarNoPedido(pedido, transacaoId, resultado, gateway, emissor),
  );
}

// Varredura periódica: QR Codes vencidos sem pagamento voltam ao carrinho, mesmo que o
// totem tenha saído do ar (ou o cliente ido embora).
export async function verificarCobrancasPix(
  gateway: PagamentoGateway = gatewayPadrao,
  emissor: EmissorFiscal = emissorPadrao,
): Promise<void> {
  const agora = Date.now();
  const vencidos = [...pedidos.values()].filter(
    (pedido) =>
      pedido.status === 'aguardando_pix' &&
      pedido.pix !== undefined &&
      Date.parse(pedido.pix.expiraEm) <= agora,
  );
  for (const pedido of vencidos) {
    await comTrava(pedido.id, () => atualizarPix(pedido, gateway, emissor)).catch((err: Error) =>
      console.error(`[pix] Falha ao expirar o pedido ${pedido.id}: ${err.message}`),
    );
  }
}

// ---------- Caixa (dinheiro) ----------

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
// uso do cupom, pontos resgatados e o número de retirada. Os pontos que ele renderia não
// entram.
export async function cancelarNoCaixa(pedidoId: string): Promise<Pedido> {
  const pedido = pedidoNoCaixa(pedidoId);
  liberarReserva(pedido);
  pedido.status = 'cancelado';
  persistir();
  return pedido;
}
