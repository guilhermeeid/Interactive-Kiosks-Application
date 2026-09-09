import { useState } from 'react';
import { atualizarItemCarrinho, removerItemCarrinho } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';
import { BotaoTouch } from '../../components/BotaoTouch';
import { formatarCentavos } from '../../utils/formatarMoeda';

// US-02: reflexo do item adicionado a partir do Cardápio.
// US-03: Revisar/editar carrinho.
export function CarrinhoScreen() {
  const [erro, setErro] = useState<string | null>(null);
  const { pedidoId, pedido, recarregarPedido, irParaEtapa } = usePedido();
  const itens = pedido?.itens ?? [];

  async function alterarQuantidade(itemCardapioId: string, quantidade: number) {
    try {
      await atualizarItemCarrinho(pedidoId, itemCardapioId, quantidade);
      await recarregarPedido();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function remover(itemCardapioId: string) {
    try {
      await removerItemCarrinho(pedidoId, itemCardapioId);
      await recarregarPedido();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <div className="tela">
      <h1>Carrinho</h1>
      {erro && <p className="erro">{erro}</p>}
      {itens.length === 0 && <p>Seu carrinho está vazio.</p>}

      <ul className="carrinho-lista">
        {itens.map((item) => (
          <li key={item.itemCardapioId}>
            <span>{item.nome}</span>
            <div className="carrinho-lista__controles">
              <BotaoTouch onClick={() => alterarQuantidade(item.itemCardapioId, item.quantidade - 1)}>
                -
              </BotaoTouch>
              <span>{item.quantidade}</span>
              <BotaoTouch onClick={() => alterarQuantidade(item.itemCardapioId, item.quantidade + 1)}>
                +
              </BotaoTouch>
            </div>
            <strong>{formatarCentavos(item.precoUnitarioCentavos * item.quantidade)}</strong>
            <BotaoTouch onClick={() => remover(item.itemCardapioId)}>Remover</BotaoTouch>
          </li>
        ))}
      </ul>

      <p className="carrinho-total">Total: {formatarCentavos(pedido?.valorTotalCentavos ?? 0)}</p>

      <div className="tela__acoes">
        <BotaoTouch onClick={() => irParaEtapa('cardapio')}>Voltar ao cardápio</BotaoTouch>
        <BotaoTouch onClick={() => irParaEtapa('identificacao')} disabled={itens.length === 0}>
          Continuar
        </BotaoTouch>
      </div>
    </div>
  );
}
