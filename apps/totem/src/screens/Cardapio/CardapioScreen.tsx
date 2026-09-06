import { useEffect, useState } from 'react';
import type { ItemCardapio } from '@totem/shared';
import { buscarCardapio } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';

// US-01: Visualizar cardápio.
// TODO: buscar itens via buscarCardapio(), renderizar em grade touch por categoria
// e permitir tocar em um item para ir ao fluxo de adicionar ao carrinho (US-02).
export function CardapioScreen() {
  const [itens, setItens] = useState<ItemCardapio[]>([]);
  const { irParaEtapa } = usePedido();

  useEffect(() => {
    // TODO: chamar buscarCardapio() e popular `itens`.
  }, []);

  return null;
}
