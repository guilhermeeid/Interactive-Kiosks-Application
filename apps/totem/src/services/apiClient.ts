import type {
  CanalComprovante,
  Comprovante,
  FormaPagamento,
  ItemCardapio,
  Pedido,
  ResultadoAplicacaoCupom,
  ResultadoPagamento,
} from '@totem/shared';

// Cliente HTTP que fala com apps/api. Centraliza a URL base e o tratamento de erro
// comum a todas as chamadas do totem.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.message ?? `Erro ${resposta.status} ao chamar ${path}`);
  }

  return resposta.status === 204 ? (undefined as T) : resposta.json();
}

// US-01
export function buscarCardapio(): Promise<ItemCardapio[]> {
  return request('/cardapio');
}

// US-03
export function obterCarrinho(pedidoId: string): Promise<Pedido> {
  return request(`/carrinho/${pedidoId}`);
}

// US-02
export function adicionarItemCarrinho(
  pedidoId: string,
  item: { itemCardapioId: string; nome: string; quantidade: number },
): Promise<Pedido> {
  return request('/carrinho/itens', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, item }),
  });
}

// US-03
export function atualizarItemCarrinho(
  pedidoId: string,
  itemCardapioId: string,
  quantidade: number,
): Promise<Pedido> {
  return request('/carrinho/itens', {
    method: 'PATCH',
    body: JSON.stringify({ pedidoId, itemCardapioId, quantidade }),
  });
}

// US-03
export function removerItemCarrinho(pedidoId: string, itemCardapioId: string): Promise<Pedido> {
  return request(`/carrinho/${pedidoId}/itens/${itemCardapioId}`, { method: 'DELETE' });
}

// US-04
// LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade)
export function informarFidelidade(pedidoId: string, numeroFidelidade: string): Promise<void> {
  return request('/identificacao/fidelidade', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, numeroFidelidade }),
  });
}

// US-05
// LGPD: dado pessoal — exige consentimento/criptografia (cpf)
export function informarCpfNota(pedidoId: string, cpf: string): Promise<void> {
  return request('/identificacao/cpf-nota', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, cpf }),
  });
}

// US-07
export function aplicarCupom(pedidoId: string, codigo: string): Promise<ResultadoAplicacaoCupom> {
  return request('/cupom/aplicar', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, codigo }),
  });
}

// US-06
export function escolherFormaPagamento(
  pedidoId: string,
  formaPagamento: FormaPagamento,
): Promise<ResultadoPagamento> {
  return request('/pagamento', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, formaPagamento }),
  });
}

// US-08
// LGPD: dado pessoal — exige consentimento/criptografia (email/telefone)
export function enviarComprovante(
  pedidoId: string,
  destino: { canal: CanalComprovante; email?: string; telefone?: string },
): Promise<Comprovante> {
  return request('/comprovante', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, ...destino }),
  });
}
