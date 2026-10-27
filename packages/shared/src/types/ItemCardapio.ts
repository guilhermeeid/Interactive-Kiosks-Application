// Tipos referentes ao cardápio digital.
// Consumido por: apps/api/src/modules/cardapio, apps/totem/src/screens/Cardapio (US-01).

// Um item que faz parte de um combo, e quantas unidades dele o combo leva.
export interface ComponenteCombo {
  itemCardapioId: string;
  quantidade: number;
}

export interface ItemCardapio {
  id: string;
  nome: string;
  descricao: string;
  categoria: string; // id de uma CategoriaCardapio
  precoCentavos: number;
  imagemUrl?: string; // foto do item: caminho servido pela API (/imagens/...)
  icone?: string; // emoji exibido quando não há foto
  // Unidades à venda; ausente = sem controle de quantidade. Num combo, vem calculado a
  // partir dos itens que o compõem (o combo não tem estoque próprio).
  estoque?: number;
  disponivel: boolean;
  // Presente só nos combos: os itens que o compõem. O combo esgota assim que qualquer um
  // deles esgota.
  componentes?: ComponenteCombo[];
}

// TODO: definir estrutura de variações/complementos (ex.: tamanho, adicionais) quando
// a modelagem de cardápio for detalhada além do MVP.
