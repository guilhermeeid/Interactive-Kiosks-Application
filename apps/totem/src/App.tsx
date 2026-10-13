import { useKioskMode } from './hooks/useKioskMode';
import { useConfig } from './contexts/ConfigContext';
import { usePedido, type EtapaFluxo } from './contexts/PedidoContext';
import { Cabecalho } from './components/Cabecalho';
import { CardapioScreen } from './screens/Cardapio';
import { CarrinhoScreen } from './screens/Carrinho';
import { IdentificacaoScreen } from './screens/Identificacao';
import { PagamentoScreen } from './screens/Pagamento';
import { ComprovanteScreen } from './screens/Comprovante';

function TelaAtual({ etapa }: { etapa: EtapaFluxo }) {
  switch (etapa) {
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

// Componente raiz: alterna entre as telas do fluxo linear do totem conforme a
// etapa atual do PedidoContext (Cardápio -> Carrinho -> Identificação -> Pagamento
// -> Comprovante). Sem roteador: o cliente nunca deve usar "voltar" do navegador.
export function App() {
  useKioskMode();
  const { etapaAtual } = usePedido();
  const { aparencia } = useConfig();

  return (
    <div className="app">
      <Cabecalho aparencia={aparencia} />
      <main className="app__conteudo">
        <TelaAtual etapa={etapaAtual} />
      </main>
    </div>
  );
}
