import { usePedido } from '../../contexts/PedidoContext';

// US-02: Adicionar ao carrinho (reflexo do item adicionado a partir do Cardápio).
// US-03: Revisar/editar carrinho — alterar quantidade ou remover itens antes de
// seguir para Identificação/Pagamento.
// TODO: renderizar `itens` do PedidoContext com controles de quantidade/remoção
// (ver atualizarQuantidade/removerItem) e um botão para avançar a etapa.
export function CarrinhoScreen() {
  const { itens, atualizarQuantidade, removerItem, irParaEtapa } = usePedido();

  return null;
}
