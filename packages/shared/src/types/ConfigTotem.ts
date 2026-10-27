// Tipos da configuração do totem, editada no modo Administrador (/admin) e lida pelo
// totem ao iniciar. Mudanças do Administrador ficam pendentes e só entram em vigor quando
// o servidor é reiniciado.
// Consumido por: apps/api/src/modules/admin, apps/totem (ConfigContext, telas e Admin).

import type { FormaPagamento } from './Pagamento';

// Telas do fluxo do cliente cujo título e descrição o administrador escolhe.
export type PaginaTotem =
  'inicio' | 'fidelidade' | 'cardapio' | 'carrinho' | 'pagamento' | 'comprovante';

export interface TextoPagina {
  titulo: string;
  descricao: string;
}

// Tela inicial: imagens que passam enquanto ninguém usa o totem.
export interface Publicidade {
  imagens: string[]; // caminhos servidos pela API (/imagens/...), na ordem de exibição
  segundosPorImagem: number;
}

export interface AparenciaTotem {
  nomeEstabelecimento: string;
  slogan: string;
  logoEmoji: string;
  logoImagemUrl?: string; // caminho servido pela API (/imagens/...); substitui o emoji
  // As fontes ficam salvas, mas o totem ainda não as aplica.
  fonteNome: string;
  fonteTextos: string;
  // Cores em hex (#rrggbb). As demais cores do totem são derivadas destas por contraste.
  corNome: string;
  corFundo: string;
  corBarra: string;
  paginas: Record<PaginaTotem, TextoPagina>;
  publicidade: Publicidade;
}

export interface CategoriaCardapio {
  id: string;
  nome: string;
  icone?: string; // emoji da aba e dos itens sem foto/ícone próprio
  iconeImagemUrl?: string; // imagem pequena no lugar do emoji, na aba
  capaUrl?: string; // foto de capa, exibida acima dos itens quando a categoria está aberta
}

// Onde ficam as abas de categoria na tela do cardápio.
export type PosicaoCategorias = 'topo' | 'esquerda' | 'direita';

export interface ConfigFidelidade {
  habilitado: boolean;
  acumuloHabilitado: boolean;
  percentualAcumulo: number; // % do valor pago que volta em pontos
  pontosPorReal: number; // equivalência: quantos pontos valem R$ 1,00
  // Desligado: pedido com cupom não pode usar pontos nem acumula pontos.
  combinaComCupom: boolean;
}

// Cada forma pode ser ligada ou desligada; pelo menos uma precisa ficar ligada.
export type FormasPagamentoHabilitadas = Record<FormaPagamento, boolean>;

// "Para comer aqui" e "Para levar". Desligar uma serve para lojas só de drive ou que
// não têm embalagem para viagem; pelo menos uma fica ligada.
export interface OpcoesConsumo {
  local: boolean;
  viagem: boolean;
}

export interface ConfigTotem {
  aparencia: AparenciaTotem;
  categorias: CategoriaCardapio[]; // na ordem em que aparecem no totem
  posicaoCategorias: PosicaoCategorias;
  exibirTodos: boolean; // aba "Todos", com os itens de todas as categorias
  fidelidade: ConfigFidelidade;
  formasPagamento: FormasPagamentoHabilitadas;
  consumo: OpcoesConsumo;
  cuponsHabilitados: boolean;
  // Endereço público dos Termos e Condições, aberto pelo QR Code do totem. Vazio = a
  // página de termos servida pela própria API.
  urlTermos?: string;
}
