import { randomUUID } from 'node:crypto';
import type { ClienteFidelidade, Pedido } from '@totem/shared';
import { clientesFidelidade, obterOuCriarPedido } from '../../db/memory-store';
import { HttpError } from '../../errors';
import type { InformarCpfNotaBody, InformarFidelidadeBody } from './identificacao.types';

const CPF_REGEX = /^\d{11}$/;

// US-04: Informar fidelidade — cadastro simplificado: um número de fidelidade novo
// vira automaticamente um cliente novo com 0 pontos.
// LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade)
export async function informarFidelidade(
  body: InformarFidelidadeBody,
): Promise<ClienteFidelidade> {
  const pedido = obterOuCriarPedido(body.pedidoId);

  let cliente = clientesFidelidade.get(body.numeroFidelidade);
  if (!cliente) {
    cliente = { id: randomUUID(), numeroFidelidade: body.numeroFidelidade, pontos: 0 };
    clientesFidelidade.set(body.numeroFidelidade, cliente);
  }

  pedido.clienteId = cliente.id;
  return cliente;
}

// US-05: Informar CPF na nota.
// TODO: validar os dígitos verificadores do CPF; por ora só validamos o formato
// (11 dígitos numéricos).
// LGPD: dado pessoal — exige consentimento/criptografia (cpf)
export async function informarCpfNota(body: InformarCpfNotaBody): Promise<Pedido> {
  const cpfLimpo = body.cpf.replace(/\D/g, '');
  if (!CPF_REGEX.test(cpfLimpo)) {
    throw new HttpError(400, 'CPF deve conter 11 dígitos');
  }

  const pedido = obterOuCriarPedido(body.pedidoId);
  pedido.cpfNaNota = cpfLimpo;
  return pedido;
}
