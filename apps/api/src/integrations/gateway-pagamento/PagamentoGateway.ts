import type { FormaPagamento, ResultadoPagamento } from '@totem/shared';

// Contrato de integração com o gateway/adquirente de pagamento.
// Consumido por: apps/api/src/modules/pagamento (US-06 / US 11).
//
// IMPORTANTE: nenhuma implementação deste contrato deve receber, transportar ou
// armazenar dados de cartão (número, validade, CVV). A tokenização/captura do
// cartão acontece inteiramente do lado do gateway (SDK do pinpad/terminal); esta
// interface troca apenas identificadores de transação e status.
export interface IniciarPagamentoParams {
  pedidoId: string;
  formaPagamento: FormaPagamento;
  valorCentavos: number;
}

// Pix com QR Code dinâmico (cobrança imediata com vencimento).
export interface CriarCobrancaPixParams {
  pedidoId: string;
  valorCentavos: number;
  expiraEmSegundos: number;
  // Mesma chave = mesma cobrança. Se a resposta do banco se perder (queda de conexão,
  // tempo esgotado), repetir a chamada com a mesma chave devolve a cobrança já criada em
  // vez de criar outra — o cliente nunca recebe dois QR Codes válidos para o mesmo valor.
  chaveIdempotencia: string;
}

export interface CobrancaPixCriada {
  transacaoId: string;
  copiaECola: string;
  valorCentavos: number;
  expiraEm: string; // ISO
}

// Aviso do banco de que uma cobrança mudou (o webhook). Quem recebe sempre confere o
// status com `consultarStatus` antes de agir: o aviso em si não é prova de pagamento.
export type OuvinteNotificacaoPix = (transacaoId: string) => Promise<void> | void;

export interface PagamentoGateway {
  iniciarPagamento(params: IniciarPagamentoParams): Promise<ResultadoPagamento>;
  criarCobrancaPix(params: CriarCobrancaPixParams): Promise<CobrancaPixCriada>;
  // Status atual: `pendente`, `autorizado` (pago), `cancelado` ou `estornado`.
  consultarStatus(transacaoId: string): Promise<ResultadoPagamento>;
  // Cancela uma cobrança Pix ainda não paga (o QR deixa de valer).
  cancelarCobranca(transacaoId: string): Promise<void>;
  estornar(transacaoId: string): Promise<void>;
}
