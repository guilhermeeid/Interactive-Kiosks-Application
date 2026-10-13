import type { ClienteFidelidade, Pedido } from '@totem/shared';
import {
  clientesFidelidade,
  config,
  exigirPedidoEmMontagem,
  obterClienteDoPedido,
  obterOuCriarPedido,
  recalcularPedido,
} from '../../db/memory-store';
import { HttpError } from '../../errors';
import { exigirConsentimento, registrarConsentimentos } from '../consentimento/consentimento.service';
import { cpfValido, limparCpf } from './cpf';
import type {
  ConsultarCpfBody,
  InformarCpfNotaBody,
  InformarFidelidadeBody,
  PularIdentificacaoBody,
  UsarPontosBody,
} from './identificacao.types';

function exigirCpfValido(cpf: unknown): string {
  const limpo = typeof cpf === 'string' ? limparCpf(cpf) : '';
  if (!cpfValido(limpo)) {
    throw new HttpError(400, 'CPF inválido');
  }
  return limpo;
}

// US-04: Saldo do cliente de fidelidade pelo CPF. Responde 400 para CPF inválido e 404
// para CPF sem cadastro; o totem nunca cadastra ninguém (isso é feito em /admin).
// LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade)
export async function consultarFidelidade(numeroFidelidade: string): Promise<ClienteFidelidade> {
  const cpf = exigirCpfValido(numeroFidelidade);
  const cliente = config.fidelidade.habilitado ? clientesFidelidade.get(cpf) : undefined;
  if (!cliente) {
    throw new HttpError(404, 'CPF sem cadastro no programa de fidelidade');
  }
  return cliente;
}

// US 09 / US-04: Confere o CPF assim que ele é digitado no totem, sem guardar nada.
// Sempre valida os dígitos verificadores (400 se inválido); o cadastro de fidelidade só
// é consultado quando o cliente marcou essa finalidade no termo — `cliente` vem `null`
// se ele não marcou, se não há cadastro ou se o programa está desligado.
// LGPD: dado pessoal — exige consentimento/criptografia (cpf)
export async function consultarCpf(
  body: ConsultarCpfBody,
): Promise<{ cliente: ClienteFidelidade | null }> {
  const cpf = exigirCpfValido(body?.cpf);
  const consultar = body.fidelidade === true && config.fidelidade.habilitado;
  return { cliente: (consultar && clientesFidelidade.get(cpf)) || null };
}

// US-04: Informar fidelidade — vincula ao pedido o cliente já cadastrado com este CPF.
// LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade)
export async function informarFidelidade(
  body: InformarFidelidadeBody,
): Promise<ClienteFidelidade> {
  const pedido = obterOuCriarPedido(body.pedidoId);
  exigirPedidoEmMontagem(pedido);
  exigirConsentimento(pedido, 'fidelidade');

  const cliente = await consultarFidelidade(body.numeroFidelidade);
  // Os pontos escolhidos eram do saldo de outro cliente.
  if (pedido.clienteId !== cliente.id) {
    pedido.pontosUsados = undefined;
    recalcularPedido(pedido);
  }
  pedido.clienteId = cliente.id;
  return cliente;
}

// US 09: Informar CPF na nota — o CPF, já conferido pelos dígitos verificadores, fica no
// pedido e segue para o emissor fiscal quando a nota é emitida (ver modules/comprovante).
// LGPD: dado pessoal — exige consentimento/criptografia (cpf)
export async function informarCpfNota(body: InformarCpfNotaBody): Promise<Pedido> {
  const cpf = exigirCpfValido(body.cpf);
  const pedido = obterOuCriarPedido(body.pedidoId);
  exigirPedidoEmMontagem(pedido);
  exigirConsentimento(pedido, 'cpf_nota');

  // Trocar de CPF desfaz o vínculo de fidelidade (e os pontos) do CPF anterior.
  if (pedido.cpfNaNota !== cpf) {
    pedido.clienteId = undefined;
    pedido.pontosUsados = undefined;
    recalcularPedido(pedido);
  }
  pedido.cpfNaNota = cpf;
  return pedido;
}

// US 10: Pular a identificação — o pedido segue sem nenhum dado pessoal e, até o fim
// desta sessão de compra, o totem não pede dados pessoais de novo (nem a API os aceita).
// A recusa das finalidades apresentadas fica registrada na auditoria (US 29).
export async function pularIdentificacao(body: PularIdentificacaoBody): Promise<Pedido> {
  const pedido = obterOuCriarPedido(body.pedidoId);
  exigirPedidoEmMontagem(pedido);

  await registrarConsentimentos({
    pedidoId: pedido.id,
    versaoTermo: body.versaoTermo,
    decisoes: config.fidelidade.habilitado
      ? { cpf_nota: false, fidelidade: false }
      : { cpf_nota: false },
  });
  // A recusa já tira CPF e fidelidade do pedido; aqui só fica a marca de que não se
  // pergunta de novo.
  pedido.semDadosPessoais = true;
  return pedido;
}

// Define quantos pontos de fidelidade o cliente quer abater neste pedido (0 desfaz).
// Os pontos só saem do saldo quando o pagamento é aprovado.
export async function usarPontos(body: UsarPontosBody): Promise<Pedido> {
  const pedido = obterOuCriarPedido(body.pedidoId);
  exigirPedidoEmMontagem(pedido);
  if (typeof body.pontos !== 'number' || !Number.isInteger(body.pontos) || body.pontos < 0) {
    throw new HttpError(400, 'Quantidade de pontos inválida');
  }

  if (body.pontos > 0) {
    const cliente = config.fidelidade.habilitado ? obterClienteDoPedido(pedido) : undefined;
    if (!cliente) {
      throw new HttpError(400, 'Informe um CPF cadastrado na fidelidade para usar pontos');
    }
    if (body.pontos > cliente.pontos) {
      throw new HttpError(
        400,
        `Não é possível usar ${body.pontos.toLocaleString('pt-BR')} pontos: ` +
          `seu saldo é de ${cliente.pontos.toLocaleString('pt-BR')} pontos`,
      );
    }
    if (pedido.cupomAplicado && !config.fidelidade.combinaComCupom) {
      throw new HttpError(400, 'Pontos e cupom não podem ser usados no mesmo pedido');
    }
  }

  pedido.pontosUsados = body.pontos;
  recalcularPedido(pedido);
  return pedido;
}
