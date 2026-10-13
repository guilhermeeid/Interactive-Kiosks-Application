// Tipos da configuração do totem, editada na tela de administrador (/admin) e lida
// pelo totem ao iniciar.
// Consumido por: apps/api/src/modules/admin, apps/totem (ConfigContext, telas e Admin).

export type PaginaTotem = 'cardapio' | 'carrinho' | 'identificacao' | 'pagamento' | 'comprovante';

export interface TextoPagina {
  titulo: string;
  descricao: string;
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
}

export interface CategoriaCardapio {
  id: string;
  nome: string;
  icone?: string; // emoji usado na aba e nos itens sem foto/ícone próprio
}

export interface ConfigFidelidade {
  habilitado: boolean;
  acumuloHabilitado: boolean;
  percentualAcumulo: number; // % do valor pago que volta em pontos
  pontosPorReal: number; // equivalência: quantos pontos valem R$ 1,00
  // Desligado: pedido com cupom não pode usar pontos nem acumula pontos.
  combinaComCupom: boolean;
}

// Dinheiro não entra aqui: é sempre aceito.
export interface FormasPagamentoOpcionais {
  credito: boolean;
  debito: boolean;
  pix: boolean;
}

export interface ConfigTotem {
  aparencia: AparenciaTotem;
  categorias: CategoriaCardapio[]; // na ordem em que aparecem no totem
  exibirTodos: boolean; // aba "Todos", com os itens de todas as categorias
  fidelidade: ConfigFidelidade;
  formasPagamento: FormasPagamentoOpcionais;
  cuponsHabilitados: boolean;
}
