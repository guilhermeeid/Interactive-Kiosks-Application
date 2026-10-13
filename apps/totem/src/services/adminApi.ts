import type {
  ClienteFidelidade,
  ConfigTotem,
  Cupom,
  CupomComSituacao,
  ItemCardapio,
  PedidoAguardandoRetirada,
  RegistroConsentimento,
  TipoDescontoCupom,
} from '@totem/shared';
import { request } from './apiClient';

// Chamadas da tela de administrador (rotas /admin da API). Todas levam o PIN no
// cabeçalho `x-admin-pin`. Campos em branco vão como `null`.

export interface DadosProduto {
  nome: string;
  descricao: string;
  categoria: string;
  precoCentavos: number;
  icone: string | null;
  imagemUrl: string | null;
  estoque: number | null; // null = sem controle de quantidade
  disponivel: boolean;
}

export interface DadosCupom {
  codigo: string;
  tipoDesconto: TipoDescontoCupom;
  valor: number;
  validoDe: string | null;
  validoAte: string | null;
  limiteUsos: number | null; // null = sem limite
  ativo: boolean;
}

export function criarAdminApi(pin: string) {
  const chamar = <T>(caminho: string, init?: RequestInit) =>
    request<T>(`/admin${caminho}`, { ...init, headers: { 'x-admin-pin': pin } });
  const enviar = <T>(metodo: string, caminho: string, corpo: unknown) =>
    chamar<T>(caminho, { method: metodo, body: JSON.stringify(corpo) });
  const excluir = (caminho: string) => chamar<void>(caminho, { method: 'DELETE' });

  return {
    conferirPin: () => chamar<void>('/sessao'),

    salvarConfig: (config: ConfigTotem) => enviar<ConfigTotem>('PUT', '/config', config),
    enviarImagem: (dataUrl: string) => enviar<{ url: string }>('POST', '/imagens', { dataUrl }),

    listarProdutos: () => chamar<ItemCardapio[]>('/produtos'),
    criarProduto: (produto: DadosProduto) => enviar<ItemCardapio>('POST', '/produtos', produto),
    atualizarProduto: (id: string, produto: DadosProduto) =>
      enviar<ItemCardapio>('PUT', `/produtos/${encodeURIComponent(id)}`, produto),
    removerProduto: (id: string) => excluir(`/produtos/${encodeURIComponent(id)}`),

    // US 13: ativos e inativos, com atributos e a situação de cada um no totem
    listarCupons: () => chamar<CupomComSituacao[]>('/cupons'),
    criarCupom: (cupom: DadosCupom) => enviar<Cupom>('POST', '/cupons', cupom),
    atualizarCupom: (codigo: string, cupom: DadosCupom) =>
      enviar<Cupom>('PUT', `/cupons/${encodeURIComponent(codigo)}`, cupom),
    excluirCupom: (codigo: string) => excluir(`/cupons/${encodeURIComponent(codigo)}`),

    // LGPD: dado pessoal — exige consentimento/criptografia (CPF dos clientes)
    listarClientes: () => chamar<ClienteFidelidade[]>('/clientes'),
    cadastrarCliente: (cpf: string, pontos: number) =>
      enviar<ClienteFidelidade>('POST', '/clientes', { cpf, pontos }),
    atualizarPontosCliente: (id: string, pontos: number) =>
      enviar<ClienteFidelidade>('PUT', `/clientes/${encodeURIComponent(id)}`, { pontos }),
    removerCliente: (id: string) => excluir(`/clientes/${encodeURIComponent(id)}`),

    listarPedidos: () => chamar<PedidoAguardandoRetirada[]>('/pedidos'),
    confirmarEntrega: (pedidoId: string) =>
      enviar<void>('POST', `/pedidos/${encodeURIComponent(pedidoId)}/entregar`, {}),

    // US 29: trilha de auditoria do consentimento, da decisão mais recente para a mais antiga
    listarConsentimentos: () => chamar<RegistroConsentimento[]>('/consentimentos'),
  };
}

export type AdminApi = ReturnType<typeof criarAdminApi>;
