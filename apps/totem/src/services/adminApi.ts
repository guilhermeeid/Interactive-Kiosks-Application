import type {
  ClienteFidelidade,
  ComPendencia,
  ComponenteCombo,
  ConfigTotem,
  Cupom,
  CupomComSituacao,
  ItemCardapio,
  PapelAcesso,
  PedidoAguardandoRetirada,
  RegistroConsentimento,
  RestricaoCupom,
  ResumoPendencias,
  TipoDescontoCupom,
} from '@totem/shared';
import { request } from './apiClient';

// Chamadas da área restrita (/admin no navegador). Todas levam o PIN no cabeçalho
// `x-pin`; o PIN define o papel: Administrador (mudanças pendentes até o servidor
// reiniciar) ou Funcionário (o que ele muda vale na hora). Campos em branco vão como
// `null`.

export interface DadosProduto {
  nome: string;
  descricao: string;
  categoria: string;
  precoCentavos: number;
  icone: string | null;
  imagemUrl: string | null;
  estoque: number | null; // null = sem controle de quantidade
  disponivel: boolean;
  componentes: ComponenteCombo[] | null; // presente = combo
}

export interface DadosCupom {
  codigo: string;
  tipoDesconto: TipoDescontoCupom;
  valor: number;
  validoDe: string | null;
  validoAte: string | null;
  limiteUsos: number | null; // null = sem limite
  aplicaEm: RestricaoCupom | null; // null = pedido inteiro
  pedidoMinimoCentavos: number | null;
  descontoMaximoCentavos: number | null;
  ativo: boolean;
}

// Modo Funcionário: o que pode mudar num produto, e vale na hora.
export interface MudancaAoVivo {
  disponivel?: boolean;
  precoCentavos?: number;
  descricao?: string;
  imagemUrl?: string | null;
}

export type ProdutoAoVivo = ItemCardapio & { disponivelNoTotem: boolean };

// Confere o PIN e devolve o papel dele.
export function conferirAcesso(pin: string): Promise<{ papel: PapelAcesso }> {
  return request('/acesso', { headers: { 'x-pin': pin } });
}

function chamadas(pin: string, prefixo: string) {
  const chamar = <T>(caminho: string, init?: RequestInit) =>
    request<T>(`${prefixo}${caminho}`, { ...init, headers: { 'x-pin': pin } });
  const enviar = <T>(metodo: string, caminho: string, corpo: unknown) =>
    chamar<T>(caminho, { method: metodo, body: JSON.stringify(corpo) });
  const excluir = (caminho: string) => chamar<void>(caminho, { method: 'DELETE' });
  return { chamar, enviar, excluir };
}

export function criarAdminApi(pin: string) {
  const { chamar, enviar, excluir } = chamadas(pin, '/admin');

  return {
    obterPendencias: () => chamar<ResumoPendencias>('/pendencias'),
    descartarPendencias: () => excluir('/pendencias'),

    obterConfig: () => chamar<ConfigTotem>('/config'),
    salvarConfig: (config: ConfigTotem) => enviar<ConfigTotem>('PUT', '/config', config),
    enviarImagem: (dataUrl: string) => enviar<{ url: string }>('POST', '/imagens', { dataUrl }),

    listarProdutos: () => chamar<ComPendencia<ItemCardapio>[]>('/produtos'),
    criarProduto: (produto: DadosProduto) => enviar<ItemCardapio>('POST', '/produtos', produto),
    atualizarProduto: (id: string, produto: DadosProduto) =>
      enviar<ItemCardapio>('PUT', `/produtos/${encodeURIComponent(id)}`, produto),
    removerProduto: (id: string) => excluir(`/produtos/${encodeURIComponent(id)}`),

    // US 13: ativos e inativos, com atributos e a situação de cada um no totem
    listarCupons: () => chamar<ComPendencia<CupomComSituacao>[]>('/cupons'),
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

    // US 29: trilha de auditoria do consentimento, da decisão mais recente para a mais antiga
    listarConsentimentos: () => chamar<RegistroConsentimento[]>('/consentimentos'),
  };
}

export function criarFuncionarioApi(pin: string) {
  const { chamar, enviar } = chamadas(pin, '/funcionario');

  return {
    listarProdutos: () => chamar<ProdutoAoVivo[]>('/produtos'),
    atualizarProduto: (id: string, mudanca: MudancaAoVivo) =>
      enviar<ProdutoAoVivo>('PATCH', `/produtos/${encodeURIComponent(id)}`, mudanca),
    enviarImagem: (dataUrl: string) => enviar<{ url: string }>('POST', '/imagens', { dataUrl }),

    listarPedidos: () => chamar<PedidoAguardandoRetirada[]>('/pedidos'),
    receberNoCaixa: (pedidoId: string) =>
      enviar<{ notaFiscalUrl?: string }>(
        'POST',
        `/pedidos/${encodeURIComponent(pedidoId)}/receber`,
        {},
      ),
    cancelarNoCaixa: (pedidoId: string) =>
      enviar<void>('POST', `/pedidos/${encodeURIComponent(pedidoId)}/cancelar`, {}),
    confirmarEntrega: (pedidoId: string) =>
      enviar<void>('POST', `/pedidos/${encodeURIComponent(pedidoId)}/entregar`, {}),
  };
}

export type AdminApi = ReturnType<typeof criarAdminApi>;
export type FuncionarioApi = ReturnType<typeof criarFuncionarioApi>;
