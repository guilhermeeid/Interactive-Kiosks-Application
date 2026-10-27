import { randomUUID } from 'node:crypto';
import type { FinalidadeConsentimento, Pedido } from '@totem/shared';
import {
  obterOuCriarPedido,
  recalcularPedido,
  registrarAuditoriaConsentimento,
} from '../../db/memory-store';
import { HttpError } from '../../errors';
import type { RegistrarConsentimentosBody } from './consentimento.types';
import { FINALIDADES, VERSAO_TERMO } from './termo';

const SEM_CONSENTIMENTO: Record<FinalidadeConsentimento, string> = {
  cpf_nota: 'É preciso concordar com o uso do CPF na nota fiscal antes de informá-lo',
  fidelidade: 'É preciso concordar com o uso do CPF na fidelidade antes de informá-lo',
  comprovante: 'É preciso concordar com o uso do e-mail ou telefone antes de informá-lo',
};

// US 29: os módulos que guardam dado pessoal chamam isto antes de guardar. Sem a
// decisão "concordo" registrada para a finalidade, o dado é recusado.
export function exigirConsentimento(pedido: Pedido, finalidade: FinalidadeConsentimento): void {
  if (pedido.consentimentos?.[finalidade] !== true) {
    throw new HttpError(403, SEM_CONSENTIMENTO[finalidade]);
  }
}

// Registra uma decisão na trilha de auditoria (data, hora, versão do termo e
// finalidade) e a aplica ao pedido. Só mudanças de decisão geram registro, para o
// cliente que vai e volta entre as telas não encher a auditoria de linhas repetidas.
function aplicarDecisao(pedido: Pedido, finalidade: FinalidadeConsentimento, aceito: boolean): void {
  if (pedido.consentimentos?.[finalidade] === aceito) {
    return;
  }
  registrarAuditoriaConsentimento({
    id: randomUUID(),
    pedidoId: pedido.id,
    finalidade,
    aceito,
    versaoTermo: VERSAO_TERMO,
    registradoEm: new Date().toISOString(),
  });
  pedido.consentimentos = { ...pedido.consentimentos, [finalidade]: aceito };

  // Recusar (ou voltar atrás) tira do pedido o dado daquela finalidade.
  if (!aceito && pedido.status === 'em_montagem') {
    if (finalidade === 'cpf_nota') {
      pedido.cpfNaNota = undefined;
    }
    if (finalidade === 'fidelidade') {
      pedido.clienteId = undefined;
      pedido.pontosUsados = undefined;
      recalcularPedido(pedido);
    }
  }
}

// US 29: registra o que o cliente decidiu para cada finalidade que lhe foi apresentada.
// É chamado pelo totem antes de enviar qualquer dado pessoal.
export async function registrarConsentimentos(body: RegistrarConsentimentosBody): Promise<Pedido> {
  if (body?.versaoTermo !== VERSAO_TERMO) {
    throw new HttpError(409, 'O termo de consentimento foi atualizado. Reinicie o totem.');
  }
  const decisoes = Object.entries(body.decisoes ?? {}) as [FinalidadeConsentimento, unknown][];
  const validas = decisoes.every(
    ([finalidade, aceito]) => FINALIDADES.includes(finalidade) && typeof aceito === 'boolean',
  );
  if (decisoes.length === 0 || !validas) {
    throw new HttpError(400, 'Consentimento inválido');
  }

  const pedido = obterOuCriarPedido(body.pedidoId);
  // US 10: cada dado pessoal é perguntado uma vez só. O que o cliente recusou (ou pulou)
  // não volta a ser pedido nem aceito neste pedido.
  const jaRecusada = decisoes.find(
    ([finalidade, aceito]) => aceito === true && pedido.consentimentos?.[finalidade] === false,
  );
  if (jaRecusada) {
    throw new HttpError(409, 'Você já recusou esse uso de dado neste pedido');
  }

  for (const [finalidade, aceito] of decisoes) {
    aplicarDecisao(pedido, finalidade, aceito as boolean);
  }
  return pedido;
}
