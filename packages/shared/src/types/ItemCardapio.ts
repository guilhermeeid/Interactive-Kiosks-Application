// Tipos referentes ao cardápio digital.
// Consumido por: apps/api/src/modules/cardapio, apps/totem/src/screens/Cardapio (US-01).

export interface ItemCardapio {
  id: string;
  nome: string;
  descricao: string;
  categoria: string; // id de uma CategoriaCardapio
  precoCentavos: number;
  imagemUrl?: string; // foto do item: caminho servido pela API (/imagens/...)
  icone?: string; // emoji exibido quando não há foto
  estoque?: number; // unidades à venda; ausente = sem controle de quantidade
  disponivel: boolean;
}

// TODO: definir estrutura de variações/complementos (ex.: tamanho, adicionais) quando
// a modelagem de cardápio for detalhada além do MVP.
