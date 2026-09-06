import { useKioskMode } from './hooks/useKioskMode';
import { usePedido } from './contexts/PedidoContext';
import { CardapioScreen } from './screens/Cardapio';
import { CarrinhoScreen } from './screens/Carrinho';
import { IdentificacaoScreen } from './screens/Identificacao';
import { PagamentoScreen } from './screens/Pagamento';
import { ComprovanteScreen } from './screens/Comprovante';

// Componente raiz: alterna entre as telas do fluxo linear do totem conforme a
// etapa atual do PedidoContext (Cardápio -> Carrinho -> Identificação -> Pagamento
// -> Comprovante). Sem roteador: o cliente nunca deve usar "voltar" do navegador.
export function App() {
  useKioskMode();
  const { etapaAtual } = usePedido();

  switch (etapaAtual) {
    case 'cardapio':
      return <CardapioScreen />;
    case 'carrinho':
      return <CarrinhoScreen />;
    case 'identificacao':
      return <IdentificacaoScreen />;
    case 'pagamento':
      return <PagamentoScreen />;
    case 'comprovante':
      return <ComprovanteScreen />;
  }
}
