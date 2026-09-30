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
      <h1 className="tela__titulo">Carrinho</h1>
      <p className="tela__subtitulo">Confira seu pedido antes de continuar.</p>
      {erro && <p className="erro">{erro}</p>}
      {itens.length === 0 && (
        <div className="vazio cartao">
          <div className="vazio__icone" aria-hidden="true">
            🛒
          </div>
          <p className="aviso">Seu carrinho está vazio.</p>
        </div>
      )}

      <ul className="carrinho-lista">
        {itens.map((item) => (
          <li key={item.itemCardapioId} className="carrinho-item">
            <div>
              <span className="carrinho-item__nome">{item.nome}</span>
              <span className="carrinho-item__unitario">
                {formatarCentavos(item.precoUnitarioCentavos)} cada
              </span>
            </div>
            <div className="quantidade">
              <BotaoTouch
                aria-label={`Diminuir ${item.nome}`}
                onClick={() => alterarQuantidade(item.itemCardapioId, item.quantidade - 1)}
              >
                −
              </BotaoTouch>
              <span className="quantidade__valor">{item.quantidade}</span>
              <BotaoTouch
                aria-label={`Aumentar ${item.nome}`}
                onClick={() => alterarQuantidade(item.itemCardapioId, item.quantidade + 1)}
              >
                +
              </BotaoTouch>
            </div>
            <strong className="carrinho-item__subtotal">
              {formatarCentavos(item.precoUnitarioCentavos * item.quantidade)}
            </strong>
            <BotaoTouch variante="perigo" onClick={() => remover(item.itemCardapioId)}>
              Remover
            </BotaoTouch>
          </li>
        ))}
      </ul>

      <p className="total">
        <span>Total</span>
        <strong>{formatarCentavos(pedido?.valorTotalCentavos ?? 0)}</strong>
      </p>

      <div className="tela__acoes">
        <BotaoTouch onClick={() => irParaEtapa('cardapio')}>Voltar ao cardápio</BotaoTouch>
        <BotaoTouch
          variante="primario"
          onClick={() => irParaEtapa('identificacao')}
          disabled={itens.length === 0}
        >
          Continuar
        </BotaoTouch>
      </div>
    </div>
  );
}
