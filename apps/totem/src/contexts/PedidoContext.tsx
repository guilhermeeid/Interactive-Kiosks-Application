import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ItemPedido } from '@totem/shared';

// Estado do pedido/carrinho em memória, compartilhado por todas as telas do fluxo
// (Cardápio -> Carrinho -> Identificação -> Pagamento -> Comprovante).
export type EtapaFluxo =
  | 'cardapio'
  | 'carrinho'
  | 'identificacao'
  | 'pagamento'
  | 'comprovante';

interface PedidoContextValue {
  etapaAtual: EtapaFluxo;
  irParaEtapa: (etapa: EtapaFluxo) => void;
  itens: ItemPedido[];
  // TODO (US-02): adicionar item ao carrinho.
  adicionarItem: (item: ItemPedido) => void;
  // TODO (US-03): atualizar quantidade de um item já no carrinho.
  atualizarQuantidade: (itemCardapioId: string, quantidade: number) => void;
  // TODO (US-03): remover item do carrinho.
  removerItem: (itemCardapioId: string) => void;
}

const PedidoContext = createContext<PedidoContextValue | undefined>(undefined);

export function PedidoProvider({ children }: { children: ReactNode }) {
  const [etapaAtual, setEtapaAtual] = useState<EtapaFluxo>('cardapio');
  const [itens, setItens] = useState<ItemPedido[]>([]);

  const value: PedidoContextValue = {
    etapaAtual,
    irParaEtapa: setEtapaAtual,
    itens,
    adicionarItem: () => {
      throw new Error('adicionarItem não implementado');
    },
    atualizarQuantidade: () => {
      throw new Error('atualizarQuantidade não implementado');
    },
    removerItem: () => {
      throw new Error('removerItem não implementado');
    },
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
