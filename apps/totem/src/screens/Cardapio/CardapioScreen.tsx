import { useEffect, useState } from 'react';
import type { ItemCardapio } from '@totem/shared';
import { adicionarItemCarrinho, buscarCardapio } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';
import { BotaoTouch } from '../../components/BotaoTouch';
import { formatarCentavos } from '../../utils/formatarMoeda';

// US-01: Visualizar cardápio.
export function CardapioScreen() {
  const [itens, setItens] = useState<ItemCardapio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const { pedidoId, pedido, recarregarPedido, irParaEtapa } = usePedido();

  useEffect(() => {
    buscarCardapio()
      .then(setItens)
      .catch((err: Error) => setErro(err.message))
      .finally(() => setCarregando(false));
  }, []);

  // US-02: Adicionar ao carrinho
  async function adicionar(item: ItemCardapio) {
    try {
      await adicionarItemCarrinho(pedidoId, {
        itemCardapioId: item.id,
        nome: item.nome,
        quantidade: 1,
      });
      await recarregarPedido();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const quantidadeNoCarrinho =
    pedido?.itens.reduce((total, item) => total + item.quantidade, 0) ?? 0;

  return (
    <div className="tela">
      <h1>Cardápio</h1>
      {carregando && <p>Carregando cardápio...</p>}
      {erro && <p className="erro">{erro}</p>}

      <div className="cardapio-grid">
        {itens.map((item) => (
          <div key={item.id} className="cardapio-item">
            <h2>{item.nome}</h2>
            <p>{item.descricao}</p>
            <strong>{formatarCentavos(item.precoCentavos)}</strong>
            <BotaoTouch onClick={() => adicionar(item)}>Adicionar</BotaoTouch>
          </div>
        ))}
      </div>

      <BotaoTouch onClick={() => irParaEtapa('carrinho')} disabled={quantidadeNoCarrinho === 0}>
        Ver carrinho ({quantidadeNoCarrinho})
      </BotaoTouch>
    </div>
  );
}
