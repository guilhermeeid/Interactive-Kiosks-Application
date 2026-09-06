import { useState } from 'react';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import { informarCpfNota, informarFidelidade } from '../../services/apiClient';
import { usePedido } from '../../contexts/PedidoContext';

// US-04: Informar fidelidade (opcional).
// US-05: Informar CPF na nota (opcional).
// LGPD: dado pessoal — exige consentimento/criptografia (número de fidelidade e CPF
// digitados nesta tela). TODO: exibir texto de consentimento antes da captura.
// TODO: usar TecladoNumerico para captura, chamar informarFidelidade/informarCpfNota
// e permitir pular ambos os campos (são opcionais) antes de ir para Pagamento.
export function IdentificacaoScreen() {
  const [numeroFidelidade, setNumeroFidelidade] = useState('');
  const [cpf, setCpf] = useState('');
  const { irParaEtapa } = usePedido();

  return null;
}
