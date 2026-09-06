// Tipos referentes ao cardápio digital.
// Consumido por: apps/api/src/modules/cardapio, apps/totem/src/screens/Cardapio (US-01).

export interface ItemCardapio {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  precoCentavos: number;
  imagemUrl?: string;
  disponivel: boolean;
}

// TODO: definir estrutura de variações/complementos (ex.: tamanho, adicionais) quando
// a modelagem de cardápio for detalhada além do MVP.
