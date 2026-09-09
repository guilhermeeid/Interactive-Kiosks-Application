import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Pedido } from '@totem/shared';
import { obterCarrinho } from '../services/apiClient';

// Etapas do fluxo linear do totem: Cardápio -> Carrinho -> Identificação ->
// Pagamento -> Comprovante. Sem roteador — o cliente nunca deve usar "voltar" do
// navegador em um kiosk.
export type EtapaFluxo = 'cardapio' | 'carrinho' | 'identificacao' | 'pagamento' | 'comprovante';

interface PedidoContextValue {
  pedidoId: string;
  pedido: Pedido | null;
  etapaAtual: EtapaFluxo;
  irParaEtapa: (etapa: EtapaFluxo) => void;
  recarregarPedido: () => Promise<void>;
  reiniciarPedido: () => void;
}

const PedidoContext = createContext<PedidoContextValue | undefined>(undefined);

// crypto.randomUUID() só existe em contexto seguro (https ou localhost); um totem
// acessado via IP na rede local por http cai no fallback abaixo.
function gerarPedidoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pedido-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PedidoProvider({ children }: { children: ReactNode }) {
  const [pedidoId, setPedidoId] = useState<string>(gerarPedidoId);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [etapaAtual, setEtapaAtual] = useState<EtapaFluxo>('cardapio');

  const recarregarPedido = useCallback(async () => {
    const atual = await obterCarrinho(pedidoId);
    setPedido(atual);
  }, [pedidoId]);

  useEffect(() => {
    recarregarPedido().catch(() => {
      // Kiosk primitivo: se a API não responder no carregamento inicial, mantém o
      // carrinho vazio localmente em vez de travar a tela.
    });
  }, [recarregarPedido]);

  const reiniciarPedido = useCallback(() => {
    setPedidoId(gerarPedidoId());
    setPedido(null);
    setEtapaAtual('cardapio');
  }, []);

  const value: PedidoContextValue = {
    pedidoId,
    pedido,
    etapaAtual,
    irParaEtapa: setEtapaAtual,
    recarregarPedido,
    reiniciarPedido,
  };

  return <PedidoContext.Provider value={value}>{children}</PedidoContext.Provider>;
}

export function usePedido(): PedidoContextValue {
  const context = useContext(PedidoContext);
  if (!context) {
    throw new Error('usePedido deve ser usado dentro de um PedidoProvider');
  }
  return context;
}
