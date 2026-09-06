import type {
  Comprovante,
  FormaPagamento,
  ItemCardapio,
  Pedido,
  ResultadoAplicacaoCupom,
  ResultadoPagamento,
} from '@totem/shared';

// Cliente HTTP que fala com apps/api. Centraliza a URL base e (futuramente)
// tratamento de erro/timeout comuns a todas as chamadas do totem.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

// TODO: implementar chamada real GET /cardapio (US-01).
export async function buscarCardapio(): Promise<ItemCardapio[]> {
  throw new Error('buscarCardapio não implementado');
}

// TODO: implementar chamadas reais ao módulo de carrinho: POST/PATCH/DELETE
// /carrinho/itens e GET /carrinho/:pedidoId (US-02, US-03).
export async function obterCarrinho(pedidoId: string): Promise<Pedido> {
  throw new Error('obterCarrinho não implementado');
}

// TODO: implementar chamada real POST /identificacao/fidelidade (US-04).
// LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade)
export async function informarFidelidade(pedidoId: string, numeroFidelidade: string): Promise<void> {
  throw new Error('informarFidelidade não implementado');
}

// TODO: implementar chamada real POST /identificacao/cpf-nota (US-05).
// LGPD: dado pessoal — exige consentimento/criptografia (cpf)
export async function informarCpfNota(pedidoId: string, cpf: string): Promise<void> {
  throw new Error('informarCpfNota não implementado');
}

// TODO: implementar chamada real POST /cupom/aplicar (US-07).
export async function aplicarCupom(pedidoId: string, codigo: string): Promise<ResultadoAplicacaoCupom> {
  throw new Error('aplicarCupom não implementado');
}

// TODO: implementar chamada real POST /pagamento (US-06).
export async function escolherFormaPagamento(
  pedidoId: string,
  formaPagamento: FormaPagamento,
): Promise<ResultadoPagamento> {
  throw new Error('escolherFormaPagamento não implementado');
}

// TODO: implementar chamada real POST /comprovante (US-08).
// LGPD: dado pessoal — exige consentimento/criptografia (email/telefone)
export async function enviarComprovante(
  pedidoId: string,
  destino: { canal: 'email' | 'sms'; email?: string; telefone?: string },
): Promise<Comprovante> {
  throw new Error('enviarComprovante não implementado');
}
