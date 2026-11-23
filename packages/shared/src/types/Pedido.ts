// Tipos referentes ao pedido/carrinho do cliente.
// Consumido por: apps/api/src/modules/carrinho, apps/totem/src/screens/Carrinho (US-02, US-03).

import type { CanalComprovante, StatusNotaConsulta } from './Comprovante';
import type { FinalidadeConsentimento } from './Consentimento';
import type { CobrancaPix, FormaPagamento } from './Pagamento';

export interface ItemPedido {
  itemCardapioId: string;
  nome: string;
  quantidade: number;
  precoUnitarioCentavos: number;
  observacoes?: string;
  // Até quantas unidades desta linha cabem no estoque, já descontando o que as outras
  // linhas do carrinho (inclusive combos) usam dos mesmos itens. Ausente = sem limite.
  // No totem, o "+" fica opaco ao atingi-lo.
  quantidadeMaxima?: number;
}

// `aguardando_pagamento`: pagamento em dinheiro, a ser feito no caixa com atendente.
// `aguardando_pix`: QR Code Pix na tela, esperando a confirmação do banco. Estoque, cupom,
// pontos e número ficam reservados; se o QR expira ou o cliente desiste, tudo volta e o
// pedido volta a `em_montagem`, com o carrinho intacto.
export type StatusPedido =
  | 'em_montagem'
  | 'aguardando_pagamento'
  | 'aguardando_pix'
  | 'pago'
  | 'finalizado'
  | 'cancelado';

// "Para comer aqui" ou "Para levar".
export type ConsumoPedido = 'local' | 'viagem';

export interface Pedido {
  id: string;
  itens: ItemPedido[];
  status: StatusPedido;
  clienteId?: string;
  cpfNaNota?: string; // LGPD: dado pessoal — exige consentimento/criptografia
  // US 29: última decisão do cliente para cada finalidade neste pedido. Um dado pessoal
  // só é guardado se a finalidade dele estiver aqui como `true`; uma finalidade recusada
  // (`false`) não é perguntada de novo no mesmo pedido.
  consentimentos?: Partial<Record<FinalidadeConsentimento, boolean>>;
  cupomAplicado?: string;
  // O cupom saiu sozinho porque o carrinho deixou de cumprir a regra dele (ex.: pedido
  // mínimo); o totem mostra este aviso no carrinho.
  avisoCupom?: string;
  pontosUsados?: number; // pontos de fidelidade resgatados neste pedido
  // Valores sempre calculados no servidor; o totem só exibe.
  valorTotalCentavos: number; // soma dos itens, antes dos descontos
  descontoCupomCentavos: number;
  descontoPontosCentavos: number;
  valorAPagarCentavos: number;
  consumo?: ConsumoPedido;
  formaPagamento?: FormaPagamento;
  // Preenchidos quando o pagamento é aprovado (ou, em dinheiro, quando o pedido vai para
  // o caixa).
  numero?: string; // três dígitos; não se repete até a entrega ser confirmada
  pontosAcumulados?: number; // creditados ao cliente
  pontosPrevistos?: number; // dinheiro: creditados quando o caixa confirmar o pagamento
  entregueEm?: string;
  criadoEm: string;
  pagoEm?: string; // quando o pagamento foi confirmado
  // Pix: a cobrança atual (QR Code na tela) e todas as que já foram geradas para este
  // pedido, para conciliar uma confirmação que chegue atrasada sem cobrar duas vezes.
  pix?: CobrancaPix;
  transacoesPix?: string[];
  pixSequencia?: number; // cobranças Pix criadas; compõe a chave de idempotência
  transacaoId?: string; // transação que efetivamente pagou o pedido
  // O banco confirmou um Pix depois que o QR já tinha expirado no totem; o pedido foi
  // conciliado com aquele pagamento, sem nova cobrança.
  conciliadoComAtraso?: boolean;
}

// Pedido como o balcão e o caixa o veem (modo Funcionário).
export interface PedidoAguardandoRetirada {
  id: string;
  numero: string;
  status: StatusPedido;
  formaPagamento?: FormaPagamento;
  consumo?: ConsumoPedido;
  itens: Pick<ItemPedido, 'nome' | 'quantidade'>[];
  valorAPagarCentavos: number;
  criadoEm: string;
  // Só em pedido pago no caixa, para o atendente conferir: sempre mascarado
  // (***.456.789-**). A nota é emitida pelo servidor com o CPF completo.
  cpfNaNotaMascarado?: string;
  notaFiscalUrl?: string;
}

// Consulta de pedidos (área restrita): pedidos que chegaram ao pagamento, com a situação
// da nota fiscal. LGPD: CPF e contatos só aparecem mascarados.
export interface FiltroConsultaPedidos {
  de?: string; // AAAA-MM-DD, inclusive, no fuso da loja
  ate?: string;
  statusNota?: StatusNotaConsulta;
  formaPagamento?: FormaPagamento;
}

export interface PedidoConsulta {
  id: string;
  numero?: string;
  status: StatusPedido;
  criadoEm: string;
  pagoEm?: string;
  formaPagamento?: FormaPagamento;
  consumo?: ConsumoPedido;
  itens: Pick<ItemPedido, 'nome' | 'quantidade'>[];
  valorAPagarCentavos: number;
  statusNota: StatusNotaConsulta;
  notaNumero?: string;
  notaChaveAcesso?: string;
  notaUrlConsulta?: string;
  notaErro?: string;
  cpfNaNotaMascarado?: string;
  // Contato que recebeu o comprovante, mascarado (ex.: jo***@g***.com).
  comprovanteCanal?: CanalComprovante;
  comprovanteContatoMascarado?: string;
  comprovanteEnviadoEm?: string;
  comprovanteFalha?: string; // última falha de envio, se o comprovante não chegou
  conciliadoComAtraso?: boolean;
}
