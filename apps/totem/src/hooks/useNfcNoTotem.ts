import { useEffect, useRef, useState } from 'react';
import type { EventoNfc } from '@totem/shared';
import { usePedido } from '../contexts/PedidoContext';
import { adicionarItemCarrinho, assinarEventosNfc } from '../services/apiClient';
import { useAvisoTemporario } from './useAvisoTemporario';

// Módulo NFC (opcional): enquanto um leitor (celular ligado por USB-C) estiver ativo, o
// cartão aproximado põe o item dele no carrinho — pelo mesmo caminho do toque na tela,
// com as mesmas regras (esgotado, quantidade máxima). Só no cardápio e no carrinho; nas
// outras telas, o cliente é orientado. Sem leitor, nada aparece e nada muda.
export function useNfcNoTotem() {
  const { pedidoId, etapaAtual, recarregarPedido } = usePedido();
  const [nfcAtivo, setNfcAtivo] = useState(false);
  const [aviso, mostrarAviso] = useAvisoTemporario(3_500);

  // Os valores mais recentes, sem reabrir a conexão a cada mudança de tela.
  const atual = useRef({ pedidoId, etapaAtual, recarregarPedido, mostrarAviso });
  atual.current = { pedidoId, etapaAtual, recarregarPedido, mostrarAviso };

  useEffect(() => {
    const tratar = async (evento: EventoNfc) => {
      const { pedidoId, etapaAtual, recarregarPedido, mostrarAviso } = atual.current;
      if (evento.tipo === 'estado') {
        setNfcAtivo(evento.leitorAtivo);
        return;
      }
      if (evento.tipo === 'desconhecido') {
        mostrarAviso(evento.motivo);
        return;
      }
      if (etapaAtual === 'inicio' || etapaAtual === 'fidelidade') {
        mostrarAviso('Toque em começar e abra o cardápio para usar o cartão.');
        return;
      }
      if (etapaAtual !== 'cardapio' && etapaAtual !== 'carrinho') {
        mostrarAviso('Para adicionar itens pelo cartão, volte ao carrinho.');
        return;
      }
      try {
        await adicionarItemCarrinho(pedidoId, {
          itemCardapioId: evento.itemCardapioId,
          nome: evento.nome,
          quantidade: 1,
        });
        await recarregarPedido();
        mostrarAviso(`+1 ${evento.nome} no carrinho.`);
      } catch (err) {
        mostrarAviso(`${evento.nome}: ${(err as Error).message}`);
      }
    };
    return assinarEventosNfc((evento) => void tratar(evento));
  }, []);

  return { nfcAtivo, aviso };
}
