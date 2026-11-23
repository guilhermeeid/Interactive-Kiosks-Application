import type {
  FiltroConsultaPedidos,
  FormaPagamento,
  ItemCardapio,
  Pedido,
  PedidoAguardandoRetirada,
  PedidoConsulta,
  StatusNotaConsulta,
} from '@totem/shared';
import {
  comprovantes,
  itemDisponivel,
  itensCardapio,
  mudarProdutoAoVivo,
  pedidoAguardaRetirada,
  pedidoNoHistorico,
  pedidos,
  persistir,
} from '../../db/memory-store';
import { HttpError } from '../../errors';
import type { EmissorFiscal } from '../../integrations/api-fiscal';
import type { ProdutoAoVivoBody } from '../admin/admin.types';
import { booleano, imagemOpcional, inteiro, inteiroOpcional, texto } from '../admin/validacao';
import { contatoMascarado, dispensarComprovante } from '../comprovante/comprovante.service';
import { mascararCpf } from '../comprovante/mascara';
import { cancelarNoCaixa, receberNoCaixa } from '../pagamento/pagamento.service';
import { diaEHora, diaValido } from '../relatorio/relatorio.service';

// Modo Funcionário (item 7): o que muda aqui vale na hora — os totens enxergam na
// próxima releitura do cardápio (até 30 segundos) e a API já aplica na mesma hora.
// O funcionário só marca itens como esgotados e troca preço, foto, descrição e
// quantidade à venda; não cria nem remove produtos.

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
  // null tira o campo (foto ou controle de quantidade).
  const mudancas: Record<string, unknown> = {};
  if (body?.disponivel !== undefined) {
    mudancas.disponivel = booleano(body.disponivel, 'Disponível');
  }
  if (body?.precoCentavos !== undefined) {
    mudancas.precoCentavos = inteiro(body.precoCentavos, 'Preço', 0, 10_000_000);
  }
  if (body?.descricao !== undefined) {
    mudancas.descricao = texto(body.descricao, 'Descrição', 200, false);
  }
  if (body?.imagemUrl !== undefined) {
    mudancas.imagemUrl = imagemOpcional(body.imagemUrl, 'Foto') ?? null;
  }
  if (body?.estoque !== undefined) {
    // Combo não tem quantidade própria: esgota junto com os itens dele.
    if (item.componentes) {
      throw new HttpError(400, 'Combo não tem quantidade própria: ela vem dos itens do combo');
    }
    mudancas.estoque = inteiroOpcional(body.estoque, 'Quantidade', 0, 99_999) ?? null;
  }
  if (Object.keys(mudancas).length === 0) {
    throw new HttpError(400, 'Nada para alterar');
  }

  mudarProdutoAoVivo(item, mudancas);
  return { ...item, disponivelNoTotem: itemDisponivel(item) };
}

// ---------- Pedidos: caixa e balcão ----------

// O que o caixa e o balcão precisam ver. O CPF só aparece no pedido que espera
// pagamento em dinheiro, e mascarado, para o atendente conferir com o cliente: a nota é
// emitida pelo servidor. Pedido com Pix ainda na tela do totem não entra.
export async function listarPedidosAguardando(): Promise<PedidoAguardandoRetirada[]> {
  return [...pedidos.values()]
    .filter((pedido) => pedidoAguardaRetirada(pedido) && pedido.status !== 'aguardando_pix')
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
      cpfNaNotaMascarado:
        pedido.status === 'aguardando_pagamento' && pedido.cpfNaNota
          ? mascararCpf(pedido.cpfNaNota)
          : undefined,
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

// ---------- Consulta de pedidos ----------

const FORMAS: FormaPagamento[] = [
  'credito',
  'debito',
  'pix',
  'vale_refeicao',
  'vale_alimentacao',
  'dinheiro',
];
const STATUS_NOTA: StatusNotaConsulta[] = ['autorizada', 'falha', 'pendente', 'nao_emitida'];

function statusNota(pedido: Pedido): StatusNotaConsulta {
  const nota = comprovantes.get(pedido.id)?.nota;
  if (nota) {
    return nota.status;
  }
  return pedido.status === 'cancelado' ? 'nao_emitida' : 'pendente';
}

function validarFiltroConsulta(entrada: Record<string, unknown> | undefined): FiltroConsultaPedidos {
  const de = diaValido(entrada?.de, 'De');
  const ate = diaValido(entrada?.ate, 'Até');
  if (de && ate && de > ate) {
    throw new HttpError(400, 'O início do período deve ser antes do fim');
  }
  const forma = entrada?.formaPagamento || undefined;
  if (forma !== undefined && !FORMAS.includes(forma as FormaPagamento)) {
    throw new HttpError(400, 'Forma de pagamento inválida');
  }
  const nota = entrada?.statusNota || undefined;
  if (nota !== undefined && !STATUS_NOTA.includes(nota as StatusNotaConsulta)) {
    throw new HttpError(400, 'Situação da nota inválida');
  }
  return {
    de,
    ate,
    formaPagamento: forma as FormaPagamento | undefined,
    statusNota: nota as StatusNotaConsulta | undefined,
  };
}

// Consulta de pedidos: os que chegaram ao pagamento, do mais recente ao mais antigo,
// filtrados por período (dia do pagamento, ou da criação se não foi pago, no fuso da
// loja), situação da nota e forma de pagamento. LGPD: CPF e contato sempre mascarados.
export async function consultarPedidos(
  entrada?: Record<string, unknown>,
  limite = 500,
): Promise<PedidoConsulta[]> {
  const filtro = validarFiltroConsulta(entrada);
  return [...pedidos.values()]
    .filter((pedido) => pedidoNoHistorico(pedido) && pedido.formaPagamento !== undefined)
    .filter((pedido) => {
      const { dia } = diaEHora(pedido.pagoEm ?? pedido.criadoEm);
      return (
        (!filtro.de || dia >= filtro.de) &&
        (!filtro.ate || dia <= filtro.ate) &&
        (!filtro.formaPagamento || pedido.formaPagamento === filtro.formaPagamento) &&
        (!filtro.statusNota || statusNota(pedido) === filtro.statusNota)
      );
    })
    .sort((a, b) => (b.pagoEm ?? b.criadoEm).localeCompare(a.pagoEm ?? a.criadoEm))
    .slice(0, limite)
    .map((pedido): PedidoConsulta => {
      const comprovante = comprovantes.get(pedido.id);
      const nota = comprovante?.nota;
      return {
        id: pedido.id,
        numero: pedido.numero,
        status: pedido.status,
        criadoEm: pedido.criadoEm,
        pagoEm: pedido.pagoEm,
        formaPagamento: pedido.formaPagamento,
        consumo: pedido.consumo,
        itens: pedido.itens.map(({ nome, quantidade }) => ({ nome, quantidade })),
        valorAPagarCentavos: pedido.valorAPagarCentavos,
        statusNota: statusNota(pedido),
        notaNumero: nota?.numero,
        notaChaveAcesso: nota?.chaveAcesso,
        notaUrlConsulta: nota?.urlConsulta,
        notaErro: nota?.status === 'falha' ? nota.erro : undefined,
        cpfNaNotaMascarado: pedido.cpfNaNota ? mascararCpf(pedido.cpfNaNota) : undefined,
        comprovanteCanal: comprovante?.destino?.canal,
        comprovanteContatoMascarado: comprovante?.destino
          ? contatoMascarado(comprovante.destino)
          : undefined,
        comprovanteEnviadoEm: comprovante?.enviadoEm,
        comprovanteFalha: comprovante?.falhaEnvio
          ? `Envio por ${comprovante.falhaEnvio.canal === 'email' ? 'e-mail' : 'SMS'} falhou: ${comprovante.falhaEnvio.erro}`
          : undefined,
        conciliadoComAtraso: pedido.conciliadoComAtraso,
      };
    });
}
