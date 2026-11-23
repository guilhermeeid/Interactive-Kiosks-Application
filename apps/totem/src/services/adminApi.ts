import type {
  CadastroNfcPendente,
  CartaoNfc,
  ClienteFidelidade,
  ComPendencia,
  ComponenteCombo,
  CanalComprovante,
  Comprovante,
  ConfigTotem,
  Cupom,
  CupomComSituacao,
  FiltroConsultaPedidos,
  FiltroRelatorioVendas,
  ItemCardapio,
  PedidoAguardandoRetirada,
  PedidoConsulta,
  RegistroConsentimento,
  RelatorioVendas,
  RestricaoCupom,
  ResumoPendencias,
  SessaoAcesso,
  TipoDescontoCupom,
} from '@totem/shared';
import { ErroApi, request } from './apiClient';

// Chamadas da área restrita (/admin no navegador). O PIN só vai na entrada, que abre uma
// sessão; as demais chamadas levam o token dela no cabeçalho `x-sessao`. O papel vem do
// PIN: Administrador (mudanças pendentes até o servidor reiniciar) ou Funcionário (o que
// ele muda vale na hora). A sessão expira depois de 30 minutos sem uso: qualquer
// resposta 401 devolve a tela à entrada (`aoExpirar`). Campos em branco vão como `null`.

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
  estoque?: number | null; // null = sem controle de quantidade
}

export type ProdutoAoVivo = ItemCardapio & { disponivelNoTotem: boolean };

// Confere o PIN e abre a sessão. 401 = PIN errado (com as tentativas que restam);
// 429 = bloqueado por excesso de erros.
export function entrar(pin: string): Promise<SessaoAcesso> {
  return request('/acesso', { method: 'POST', body: JSON.stringify({ pin }) });
}

export function sair(token: string): Promise<void> {
  return request('/acesso/sair', { method: 'POST', body: '{}', headers: { 'x-sessao': token } });
}

type AoExpirar = (mensagem: string) => void;

// `passiva`: chamada automática da tela (atualização periódica), que não conta como uso
// para a expiração por inatividade.
function chamadas(token: string, prefixo: string, aoExpirar: AoExpirar) {
  const chamar = async <T>(caminho: string, init?: RequestInit, passiva = false) => {
    try {
      return await request<T>(`${prefixo}${caminho}`, {
        ...init,
        headers: { 'x-sessao': token, ...(passiva ? { 'x-sessao-passiva': '1' } : {}) },
      });
    } catch (err) {
      if (err instanceof ErroApi && err.status === 401) {
        aoExpirar(err.message);
      }
      throw err;
    }
  };
  const enviar = <T>(metodo: string, caminho: string, corpo: unknown) =>
    chamar<T>(caminho, { method: metodo, body: JSON.stringify(corpo) });
  const excluir = (caminho: string) => chamar<void>(caminho, { method: 'DELETE' });
  return { chamar, enviar, excluir };
}

export function criarAdminApi(token: string, aoExpirar: AoExpirar) {
  const { chamar, enviar, excluir } = chamadas(token, '/admin', aoExpirar);

  return {
    obterPendencias: () => chamar<ResumoPendencias>('/pendencias'),
    descartarPendencias: () => excluir('/pendencias'),

    obterConfig: () => chamar<ConfigTotem>('/config'),
    salvarConfig: (config: ConfigTotem) => enviar<ConfigTotem>('PUT', '/config', config),
    // Ordem e ativação das categorias: valem na hora. Desativar categoria com itens
    // responde 409 (código CONFIRMAR_DESATIVACAO) até vir `confirmarDesativacao`.
    organizarCategorias: (ordem: string[], inativas: string[], confirmarDesativacao = false) =>
      enviar<ConfigTotem>('PUT', '/categorias/organizacao', {
        ordem,
        inativas,
        confirmarDesativacao,
      }),
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

    // Módulo NFC: cartões travados, ligados a um item pelo número de série
    listarCartoesNfc: () => chamar<(CartaoNfc & { nomeItem?: string })[]>('/nfc/cartoes'),
    removerCartaoNfc: (numeroSerie: string) =>
      excluir(`/nfc/cartoes/${encodeURIComponent(numeroSerie)}`),
    // O próximo cartão aproximado do leitor (em até 60 s) fica ligado a este item.
    iniciarCadastroNfc: (itemCardapioId: string) =>
      enviar<CadastroNfcPendente>('POST', '/nfc/cadastro', { itemCardapioId }),
    obterCadastroNfc: () => chamar<CadastroNfcPendente | null>('/nfc/cadastro'),
    cancelarCadastroNfc: () => excluir('/nfc/cadastro'),

    // US 25: relatório de vendas; filtros vazios ficam de fora da consulta
    relatorioVendas: (filtro: FiltroRelatorioVendas) => {
      const consulta = new URLSearchParams(
        Object.entries(filtro).filter((par): par is [string, string] => Boolean(par[1])),
      );
      return chamar<RelatorioVendas>(`/relatorio/vendas?${consulta}`);
    },
  };
}

// Reenvio do comprovante: para o contato que já recebeu ou para um novo, autorizado
// pelo cliente no balcão.
export type PedidoReenvio =
  | { contatoOriginal: true }
  | {
      canal: CanalComprovante;
      email?: string;
      telefone?: string;
      autorizadoPeloCliente: boolean;
    };

export function criarFuncionarioApi(token: string, aoExpirar: AoExpirar) {
  const { chamar, enviar } = chamadas(token, '/funcionario', aoExpirar);

  return {
    listarProdutos: () => chamar<ProdutoAoVivo[]>('/produtos'),
    atualizarProduto: (id: string, mudanca: MudancaAoVivo) =>
      enviar<ProdutoAoVivo>('PATCH', `/produtos/${encodeURIComponent(id)}`, mudanca),
    enviarImagem: (dataUrl: string) => enviar<{ url: string }>('POST', '/imagens', { dataUrl }),

    // `passiva`: a atualização automática da lista não mantém a sessão viva.
    listarPedidos: (passiva = false) =>
      chamar<PedidoAguardandoRetirada[]>('/pedidos', undefined, passiva),
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

    // Consulta de pedidos (CPF e contatos já vêm mascarados); filtros vazios ficam de fora
    consultarPedidos: (filtro: FiltroConsultaPedidos) => {
      const consulta = new URLSearchParams(
        Object.entries(filtro).filter((par): par is [string, string] => Boolean(par[1])),
      );
      return chamar<PedidoConsulta[]>(`/historico?${consulta}`);
    },
    reenviarComprovante: (pedidoId: string, pedido: PedidoReenvio) =>
      enviar<{ canal: CanalComprovante; contatoMascarado: string }>(
        'POST',
        `/historico/${encodeURIComponent(pedidoId)}/reenviar`,
        pedido,
      ),
    reemitirNota: (pedidoId: string) =>
      enviar<Comprovante>('POST', `/historico/${encodeURIComponent(pedidoId)}/nota`, {}),
  };
}

export type AdminApi = ReturnType<typeof criarAdminApi>;
export type FuncionarioApi = ReturnType<typeof criarFuncionarioApi>;
