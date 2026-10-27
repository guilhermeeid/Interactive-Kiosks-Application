import type {
  CanalComprovante,
  ClienteFidelidade,
  Comprovante,
  ConfigTotem,
  ConsumoPedido,
  FinalidadeConsentimento,
  FormaPagamento,
  ItemCardapio,
  Pedido,
  ResultadoAplicacaoCupom,
  ResultadoPagamento,
  TermoConsentimento,
} from '@totem/shared';

// Cliente HTTP que fala com apps/api. Centraliza a URL base e o tratamento de erro
// comum a todas as chamadas do totem.
// Sem VITE_API_URL, assume a API na mesma máquina que serviu a página — assim o totem
// e a tela de administrador também funcionam quando abertos por IP na rede local.
const API_URL = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:3333`;

// Erro de uma chamada à API, com o status HTTP para a tela distinguir os casos
// (ex.: 400 = CPF inválido, 404 = CPF sem cadastro).
export class ErroApi extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new ErroApi(
      resposta.status,
      corpo.message ?? `Erro ${resposta.status} ao chamar ${path}`,
    );
  }

  return resposta.status === 204 ? (undefined as T) : resposta.json();
}

// Fotos dos itens e logotipo chegam como caminho da API (/imagens/...).
export function urlImagem(caminho: string): string {
  return `${API_URL}${caminho}`;
}

// Configuração definida pelo administrador, lida uma vez quando o totem inicia.
export function buscarConfig(): Promise<ConfigTotem> {
  return request('/config');
}

// Identifica a execução do servidor. Quando muda, o servidor foi reiniciado e as
// mudanças do Administrador entraram em vigor: o totem se recarrega ao voltar à tela
// inicial.
export function buscarVersaoServidor(): Promise<{ versao: string }> {
  return request('/versao');
}

// Página pública dos Termos e Condições na própria API, usada no QR Code quando o
// administrador não informa outro endereço.
export function urlTermosPadrao(): string {
  return `${API_URL}/consentimento/termos`;
}

// US-01 (categoria) e US-02 (busca por nome)
export function buscarCardapio(
  filtros: { categoria?: string; busca?: string } = {},
): Promise<ItemCardapio[]> {
  const params = new URLSearchParams();
  if (filtros.categoria) params.set('categoria', filtros.categoria);
  if (filtros.busca?.trim()) params.set('busca', filtros.busca.trim());
  const query = params.toString();
  return request(`/cardapio${query ? `?${query}` : ''}`);
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

// US-04: vincula ao pedido o cliente de fidelidade já cadastrado com este CPF
// LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade)
export function informarFidelidade(
  pedidoId: string,
  numeroFidelidade: string,
): Promise<ClienteFidelidade> {
  return request('/identificacao/fidelidade', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, numeroFidelidade }),
  });
}

// US 09 / US-04: confere o CPF digitado, sem guardar nada. Falha com status 400 se os
// dígitos verificadores não baterem. Só consulta o cadastro de fidelidade quando
// `fidelidade` é true (o cliente marcou essa finalidade no termo); `cliente` vem `null`
// se não há cadastro.
// LGPD: dado pessoal — exige consentimento/criptografia (cpf)
export function consultarCpf(
  cpf: string,
  fidelidade: boolean,
): Promise<{ cliente: ClienteFidelidade | null }> {
  return request('/identificacao/cpf', {
    method: 'POST',
    body: JSON.stringify({ cpf, fidelidade }),
  });
}

// Fidelidade pelo QR Code do cartão do cliente (câmera do totem)
export function informarFidelidadePorQr(
  pedidoId: string,
  codigo: string,
): Promise<ClienteFidelidade> {
  return request('/identificacao/fidelidade/qr', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, codigo }),
  });
}

// Define quantos pontos de fidelidade abater do pedido (0 desfaz o resgate)
export function usarPontos(pedidoId: string, pontos: number): Promise<Pedido> {
  return request('/identificacao/fidelidade/pontos', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, pontos }),
  });
}

// US 09
// LGPD: dado pessoal — exige consentimento/criptografia (cpf)
export function informarCpfNota(pedidoId: string, cpf: string): Promise<Pedido> {
  return request('/identificacao/cpf-nota', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, cpf }),
  });
}

// US 29: termo de consentimento vigente (versão + textos), lido quando o totem inicia
export function buscarTermoConsentimento(): Promise<TermoConsentimento> {
  return request('/consentimento/termo');
}

// US 29: registra o que o cliente decidiu para cada finalidade apresentada, antes de
// qualquer dado pessoal ser enviado
export function registrarConsentimentos(
  pedidoId: string,
  versaoTermo: string,
  decisoes: Partial<Record<FinalidadeConsentimento, boolean>>,
): Promise<Pedido> {
  return request('/consentimento', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, versaoTermo, decisoes }),
  });
}

// US 13
export function aplicarCupom(pedidoId: string, codigo: string): Promise<ResultadoAplicacaoCupom> {
  return request('/cupom/aplicar', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, codigo }),
  });
}

export function removerCupom(pedidoId: string): Promise<Pedido> {
  return request(`/cupom/${pedidoId}`, { method: 'DELETE' });
}

// US-06
// Item 11: "consumo" é "para comer aqui" ou "para levar".
export function escolherFormaPagamento(
  pedidoId: string,
  formaPagamento: FormaPagamento,
  consumo?: ConsumoPedido,
): Promise<ResultadoPagamento> {
  return request('/pagamento', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, formaPagamento, consumo }),
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

// Conclui o pedido sem comprovante por e-mail/SMS: nenhum dado pessoal é pedido
export function dispensarComprovante(pedidoId: string): Promise<Comprovante> {
  return request('/comprovante/dispensar', {
    method: 'POST',
    body: JSON.stringify({ pedidoId }),
  });
}
