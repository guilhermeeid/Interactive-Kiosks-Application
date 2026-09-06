import { useState } from 'react';
import type { FormaPagamento } from '@totem/shared';
import { aplicarCupom, escolherFormaPagamento } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';

// US-06: Escolher forma de pagamento (crédito, débito, PIX, dinheiro).
// US-07: Aplicar cupom de desconto antes de confirmar o pagamento.
// IMPORTANTE: esta tela nunca deve capturar ou armazenar dados de cartão — a
// tokenização acontece no gateway/adquirente (ver apps/api/src/integrations/gateway-pagamento).
// TODO: renderizar campo de cupom (chamando aplicarCupom) e opções de forma de
// pagamento (chamando escolherFormaPagamento), depois avançar para Comprovante.
export function PagamentoScreen() {
  const [codigoCupom, setCodigoCupom] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | null>(null);
  const { irParaEtapa } = usePedido();

  return null;
}
