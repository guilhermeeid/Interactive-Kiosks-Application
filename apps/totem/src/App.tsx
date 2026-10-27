import { useEffect } from 'react';
import { useKioskMode } from './hooks/useKioskMode';
import { useServidorReiniciado } from './hooks/useServidorReiniciado';
import { useConfig } from './contexts/ConfigContext';
import { usePedido, type EtapaFluxo } from './contexts/PedidoContext';
import { Cabecalho } from './components/Cabecalho';
import { InicioScreen } from './screens/Inicio';
import { FidelidadeScreen } from './screens/Fidelidade';
import { CardapioScreen } from './screens/Cardapio';
import { CarrinhoScreen } from './screens/Carrinho';
import { PagamentoScreen } from './screens/Pagamento';
import { ComprovanteScreen } from './screens/Comprovante';

function TelaAtual({ etapa }: { etapa: EtapaFluxo }) {
  switch (etapa) {
    case 'inicio':
      return <InicioScreen />;
    case 'fidelidade':
      return <FidelidadeScreen />;
    case 'cardapio':
      return <CardapioScreen />;
    case 'carrinho':
      return <CarrinhoScreen />;
    case 'pagamento':
      return <PagamentoScreen />;
    case 'conclusao':
      return <ComprovanteScreen />;
  }
}

// Componente raiz do totem, em formato 9:16 de pé (no monitor do computador, fica uma
// coluna centralizada nessa proporção). Alterna entre as telas do fluxo conforme a etapa
// do PedidoContext. Sem roteador: o cliente nunca deve usar "voltar" do navegador.
export function App() {
  useKioskMode();
  const { etapaAtual } = usePedido();
  const { aparencia } = useConfig();
  const servidorReiniciado = useServidorReiniciado();

  // Item 7: o servidor reiniciou (mudanças do Administrador em vigor): o totem se
  // recarrega na tela inicial, sem interromper um cliente no meio do pedido.
  useEffect(() => {
    if (servidorReiniciado && etapaAtual === 'inicio') {
      window.location.reload();
    }
  }, [servidorReiniciado, etapaAtual]);

  return (
    <div className="moldura">
      <div className="app">
        {etapaAtual !== 'inicio' && <Cabecalho aparencia={aparencia} />}
        <main className="app__conteudo">
          <TelaAtual etapa={etapaAtual} />
        </main>
      </div>
    </div>
  );
}
