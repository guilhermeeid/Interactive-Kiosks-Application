import type { FinalidadeConsentimento, TermoConsentimento } from '@totem/shared';
import { config } from '../../db/memory-store';

// Versão do termo de consentimento exibido no totem. Mudou qualquer texto de
// `obterTermo`? Aumente a versão: a auditoria registra diante de qual versão cada
// cliente decidiu.
export const VERSAO_TERMO = '1.0';

export const FINALIDADES: FinalidadeConsentimento[] = ['cpf_nota', 'fidelidade', 'comprovante'];

// US 29: aviso de finalidades mostrado antes de qualquer dado pessoal ser guardado.
export function obterTermo(): TermoConsentimento {
  return {
    versao: VERSAO_TERMO,
    aviso:
      `${config.aparencia.nomeEstabelecimento} só guarda seus dados pessoais para as ` +
      'finalidades que você marcar. Nada é obrigatório: você pode concluir o pedido sem ' +
      'informar nenhum dado.',
    finalidades: {
      cpf_nota: 'Concordo em usar meu CPF na nota fiscal deste pedido.',
      fidelidade:
        'Concordo em usar meu CPF no programa de fidelidade, para consultar meu saldo, ' +
        'usar e acumular pontos.',
      comprovante:
        'Concordo em usar meu e-mail ou telefone para receber o comprovante deste pedido.',
    },
  };
}
