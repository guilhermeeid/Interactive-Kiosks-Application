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
  SessaoPainel,
  TipoDescontoCupom,
  UsuarioPainel,
} from '@totem/shared';
import { ErroApi, request } from './apiClient';

// Chamadas da área restrita (/admin no navegador). Card E / US 35: cada chamada leva o
// token da sessão (`Authorization: Bearer`), e o perfil do usuário define o que ele pode
// fazer: Administrador (mudanças pendentes até o servidor reiniciar) ou Funcionário (o
// que ele muda vale na hora). Se a sessão acabar — inatividade, senha trocada, usuário
// removido, servidor reiniciado —, `aoEncerrar` recebe o motivo e a tela volta para a
// entrada. Campos em branco vão como `null`.

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

export interface DadosUsuario {
  login: string;
  nome: string;
  papel: PapelAcesso;
  senha: string;
}

// Card E / US 35: confere usuário e senha e abre a sessão.
export function entrar(login: string, senha: string): Promise<SessaoPainel> {
  return request('/acesso/entrar', { method: 'POST', body: JSON.stringify({ login, senha }) });
}

type AoEncerrar = (motivo: string) => void;

interface OpcoesChamada extends RequestInit {
  // Chamada que a tela faz sozinha (ex.: atualizar a lista de pedidos): não conta como
  // atividade do usuário, para uma tela esquecida aberta não manter a sessão viva.
  automatica?: boolean;
}

function chamadas(token: string, prefixo: string, aoEncerrar: AoEncerrar) {
  const chamar = async <T>(caminho: string, opcoes: OpcoesChamada = {}): Promise<T> => {
    const { automatica, ...init } = opcoes;
    try {
      return await request<T>(`${prefixo}${caminho}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(automatica && { 'x-atividade': 'automatica' }),
        },
      });
    } catch (err) {
      if (err instanceof ErroApi && err.status === 401) {
        aoEncerrar(err.message);
      }
      throw err;
    }
  };
  const enviar = <T>(metodo: string, caminho: string, corpo: unknown) =>
    chamar<T>(caminho, { method: metodo, body: JSON.stringify(corpo) });
  const excluir = (caminho: string) => chamar<void>(caminho, { method: 'DELETE' });
  return { chamar, enviar, excluir };
}

export function criarSessaoApi(token: string, aoEncerrar: AoEncerrar) {
  const { chamar, enviar } = chamadas(token, '/acesso', aoEncerrar);
  return {
    // Conta como atividade: a tela chama isto quando o usuário mexe nela.
    renovar: () => chamar<UsuarioPainel>('/sessao'),
    sair: () => enviar<void>('POST', '/sair', {}),
  };
}

export function criarAdminApi(token: string, aoEncerrar: AoEncerrar) {
  const { chamar, enviar, excluir } = chamadas(token, '/admin', aoEncerrar);

  return {
    obterPendencias: () => chamar<ResumoPendencias>('/pendencias'),
    descartarPendencias: () => excluir('/pendencias'),

    obterConfig: () => chamar<ConfigTotem>('/config'),
    // US 33: categorias com produtos só são desativadas com o id em `confirmarDesativacao`.
    salvarConfig: (config: ConfigTotem, confirmarDesativacao: string[] = []) =>
      enviar<ConfigTotem>('PUT', '/config', { ...config, confirmarDesativacao }),
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

    // US 35: usuários do painel e seus perfis (vale na hora)
    listarUsuarios: () => chamar<UsuarioPainel[]>('/usuarios'),
    criarUsuario: (usuario: DadosUsuario) => enviar<UsuarioPainel>('POST', '/usuarios', usuario),
    removerUsuario: (id: string) => excluir(`/usuarios/${encodeURIComponent(id)}`),
    redefinirSenha: (id: string, senha: string) =>
      enviar<UsuarioPainel>('PUT', `/usuarios/${encodeURIComponent(id)}/senha`, { senha }),
    desbloquearUsuario: (id: string) =>
      enviar<UsuarioPainel>('POST', `/usuarios/${encodeURIComponent(id)}/desbloquear`, {}),
  };
}

export function criarFuncionarioApi(token: string, aoEncerrar: AoEncerrar) {
  const { chamar, enviar } = chamadas(token, '/funcionario', aoEncerrar);

  return {
    listarProdutos: () => chamar<ProdutoAoVivo[]>('/produtos'),
    atualizarProduto: (id: string, mudanca: MudancaAoVivo) =>
      enviar<ProdutoAoVivo>('PATCH', `/produtos/${encodeURIComponent(id)}`, mudanca),
    enviarImagem: (dataUrl: string) => enviar<{ url: string }>('POST', '/imagens', { dataUrl }),

    listarPedidos: (automatica = false) =>
      chamar<PedidoAguardandoRetirada[]>('/pedidos', { automatica }),
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

export type SessaoApi = ReturnType<typeof criarSessaoApi>;
export type AdminApi = ReturnType<typeof criarAdminApi>;
export type FuncionarioApi = ReturnType<typeof criarFuncionarioApi>;
