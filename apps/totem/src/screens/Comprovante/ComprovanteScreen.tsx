import { useState } from 'react';
import type { CanalComprovante } from '@totem/shared';
import { enviarComprovante } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';

// US-08: Receber comprovante por e-mail/SMS.
// LGPD: dado pessoal — exige consentimento/criptografia (e-mail/telefone digitados
// nesta tela). TODO: exibir texto de consentimento antes da captura.
// TODO: capturar canal + destino (via TecladoNumerico para telefone, ou campo de
// e-mail), chamar enviarComprovante() e exibir confirmação de envio ao cliente.
export function ComprovanteScreen() {
  const [canal, setCanal] = useState<CanalComprovante | null>(null);
  const [destino, setDestino] = useState('');
  const { irParaEtapa } = usePedido();

  return null;
}
