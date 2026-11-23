// Tipos referentes a pagamento.
// Consumido por: apps/api/src/modules/pagamento, apps/api/src/integrations/gateway-pagamento,
// apps/totem/src/screens/Pagamento (US-06).
//
// IMPORTANTE: nenhum dado de cartão (número, validade, CVV) deve ser modelado aqui.
// O pagamento é sempre delegado ao gateway/adquirente via tokenização — ver
// apps/api/src/integrations/gateway-pagamento/PagamentoGateway.ts.

import type { StatusPedido } from './Pedido';

// Vale-refeição e vale-alimentação são meios de pagamento próprios, não crédito nem
// débito: têm códigos próprios na NFC-e (tPag 11 e 10) e são habilitados separadamente
// na credenciadora (produto "voucher" da maquininha/pinpad).
// Dinheiro não passa pelo totem: o cliente paga no caixa, com atendente.
export type FormaPagamento =
  'credito' | 'debito' | 'pix' | 'vale_refeicao' | 'vale_alimentacao' | 'dinheiro';

// `pendente` = pagamento em dinheiro, a ser feito no caixa, ou Pix esperando o cliente
// pagar. `cancelado` = cobrança Pix cancelada ou expirada sem pagamento.
export type StatusPagamento =
  'pendente' | 'autorizado' | 'recusado' | 'estornado' | 'cancelado';

// Situação da cobrança Pix atual de um pedido, como o totem a mostra.
export type StatusCobrancaPix = 'pendente' | 'paga' | 'expirada' | 'cancelada';

// QR Code dinâmico: vale só para este pedido, com este valor, até `expiraEm`.
export interface CobrancaPix {
  transacaoId: string;
  copiaECola: string; // conteúdo do QR Code (BR Code / "Pix copia e cola")
  valorCentavos: number;
  criadaEm: string;
  expiraEm: string; // ISO
  status: StatusCobrancaPix;
}

// O que o totem consulta enquanto o QR Code está na tela.
export interface SituacaoPix {
  statusPedido: StatusPedido;
  pix?: CobrancaPix;
  segundosRestantes: number; // calculado no servidor, imune ao relógio do totem
}

export interface ResultadoPagamento {
  transacaoId: string;
  formaPagamento: FormaPagamento;
  status: StatusPagamento;
  valorCentavos: number;
  autorizadoEm?: string;
  pix?: CobrancaPix; // presente quando a forma é Pix e o QR Code foi gerado
}
