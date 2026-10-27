import { useState } from 'react';
import { atualizarItemCarrinho, removerItemCarrinho } from '../../services/apiClient';
import { useConfig } from '../../contexts/ConfigContext';
import { usePedido } from '../../contexts/PedidoContext';
import { useAvisoTemporario } from '../../hooks/useAvisoTemporario';
import { BotaoTouch } from '../../components/BotaoTouch';
import { SecaoCupom, SecaoPontos } from '../../components/DescontosPedido';
import { ResumoPedido } from '../../components/ResumoPedido';
import { SeletorQuantidade } from '../../components/SeletorQuantidade';
import { formatarCentavos } from '../../utils/formatarMoeda';

// Tela 3 — Carrinho, com cupom e pontos de fidelidade.
// US-03 / US 04 / US 05: revisar e editar o pedido. Reduzir a zero remove o item, sem
// confirmação (decisão de produto). Carrinho vazio: só resta voltar ao cardápio.
// US 13 / US 14: aplicar, trocar e remover cupom. Pontos: só para quem se identificou.
export function CarrinhoScreen() {
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, mostrarAviso] = useAvisoTemporario();
  const { paginas } = useConfig().aparencia;
  const { pedidoId, pedido, recarregarPedido, irParaEtapa } = usePedido();
  const itens = pedido?.itens ?? [];

  async function alterarQuantidade(itemCardapioId: string, quantidade: number) {
    try {
      await atualizarItemCarrinho(pedidoId, itemCardapioId, quantidade);
      await recarregarPedido();
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function remover(itemCardapioId: string) {
    try {
      await removerItemCarrinho(pedidoId, itemCardapioId);
      await recarregarPedido();
      setErro(null);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <div className="tela">
      <h1 className="tela__titulo">{paginas.carrinho.titulo}</h1>
      <p className="tela__subtitulo">{paginas.carrinho.descricao}</p>
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
            <div className="carrinho-item__descricao">
              <span className="carrinho-item__nome">{item.nome}</span>
              <span className="carrinho-item__unitario">
                {formatarCentavos(item.precoUnitarioCentavos)} cada
              </span>
            </div>
            <SeletorQuantidade
              valor={item.quantidade}
              nomeItem={item.nome}
              maximo={item.quantidadeMaxima}
              aoMudar={(quantidade) => alterarQuantidade(item.itemCardapioId, quantidade)}
              aoTocarNoLimite={() =>
                mostrarAviso(`Quantidade máxima atingida: não há mais unidades de ${item.nome}.`)
              }
            />
            <strong className="carrinho-item__subtotal">
              {formatarCentavos(item.precoUnitarioCentavos * item.quantidade)}
            </strong>
            <BotaoTouch variante="perigo" onClick={() => remover(item.itemCardapioId)}>
              Remover
            </BotaoTouch>
          </li>
        ))}
      </ul>

      {itens.length > 0 && (
        <>
          <SecaoCupom />
          <SecaoPontos />
          <ResumoPedido pedido={pedido} />
        </>
      )}

      {aviso && (
        <p className="aviso-flutuante" role="status">
          {aviso}
        </p>
      )}

      <div className="tela__acoes">
        <BotaoTouch onClick={() => irParaEtapa('cardapio')}>Voltar ao cardápio</BotaoTouch>
        {itens.length > 0 && (
          <BotaoTouch variante="primario" onClick={() => irParaEtapa('pagamento')}>
            Ir para o pagamento
          </BotaoTouch>
        )}
      </div>
    </div>
  );
}
