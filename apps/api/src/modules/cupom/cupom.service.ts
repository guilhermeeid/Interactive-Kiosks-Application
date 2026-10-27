import type { Cupom, Pedido, ResultadoAplicacaoCupom, SituacaoCupom } from '@totem/shared';
import {
  calcularResultadoCupom,
  config,
  cupons,
  exigirPedidoEmMontagem,
  motivoCupomNaoServe,
  obterOuCriarPedido,
  recalcularPedido,
} from '../../db/memory-store';
import { HttpError } from '../../errors';
import type { AplicarCupomBody } from './cupom.types';

// A vigência do cupom tem data e hora, então a mensagem mostra as duas.
function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });
}

// US 36: um cupom precisa dar algum desconto. Zero, negativo, mais de 100% ou fração de
// centavo não fazem sentido. A área restrita recusa esses valores ao salvar e o totem
// recusa um cupom assim que já esteja gravado (ex.: inserido direto nos dados).
export function problemaNoDesconto(tipoDesconto: unknown, valor: unknown): string | null {
  if (tipoDesconto !== 'percentual' && tipoDesconto !== 'valor_fixo') {
    return 'Escolha o tipo de desconto do cupom';
  }
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return 'Informe o desconto do cupom';
  }
  if (valor <= 0) {
    return 'O desconto do cupom precisa ser maior que zero';
  }
  if (tipoDesconto === 'percentual') {
    if (valor > 100) return 'O desconto em percentual vai até 100%';
    if (valor < 0.01) return 'O desconto em percentual precisa ser de pelo menos 0,01%';
  } else {
    if (!Number.isInteger(valor)) return 'O desconto em reais precisa ser em centavos inteiros';
    if (valor > 10_000_000) return 'O desconto em reais vai até R$ 100.000,00';
  }
  return null;
}

// US 24: Regras que decidem se um cupom é aceito agora, lidas dos atributos que o
// administrador cadastrou: precisa estar ativo, dentro da vigência (`validoDe` e
// `validoAte` são inclusivos e opcionais — sem data = sem limite naquele lado) e ainda
// ter usos disponíveis. É a única fonte dessas regras: o totem (ao aplicar e ao pagar) e
// a lista do administrador (US 13) usam esta mesma função.
export function situacaoCupom(cupom: Cupom, agora: Date = new Date()): SituacaoCupom {
  if (problemaNoDesconto(cupom.tipoDesconto, cupom.valor)) {
    return 'sem_desconto';
  }
  if (!cupom.ativo) {
    return 'inativo';
  }
  if (cupom.validoDe && new Date(cupom.validoDe).getTime() > agora.getTime()) {
    return 'nao_vigente';
  }
  if (cupom.validoAte && new Date(cupom.validoAte).getTime() < agora.getTime()) {
    return 'expirado';
  }
  if (cupom.limiteUsos !== undefined && (cupom.usos ?? 0) >= cupom.limiteUsos) {
    return 'esgotado';
  }
  return 'valido';
}

function recusarCupom(cupom: Cupom, situacao: Exclude<SituacaoCupom, 'valido'>): never {
  const motivos: Record<typeof situacao, () => string> = {
    sem_desconto: () => 'não tem um desconto válido',
    inativo: () => 'inválido ou inativo',
    nao_vigente: () =>
      `ainda não está válido (a partir de ${formatarDataHora(cupom.validoDe as string)})`,
    expirado: () => 'expirado',
    esgotado: () => 'esgotado',
  };
  throw new HttpError(400, `Cupom "${cupom.codigo}" ${motivos[situacao]()}`);
}

// US 24: só a vigência (ativo + datas), sem olhar o limite de usos.
export function validarVigenciaCupom(cupom: Cupom, agora: Date = new Date()): void {
  const situacao = situacaoCupom(cupom, agora);
  if (situacao !== 'valido' && situacao !== 'esgotado') {
    recusarCupom(cupom, situacao);
  }
}

// Vigência + limite de usos definido pelo administrador. Um uso só conta quando o
// pagamento do pedido é aprovado (ver modules/pagamento).
export function validarCupom(cupom: Cupom, agora: Date = new Date()): void {
  const situacao = situacaoCupom(cupom, agora);
  if (situacao !== 'valido') {
    recusarCupom(cupom, situacao);
  }
}

// US 13: Aplicar cupom — valida código/vigência e calcula o desconto sobre o
// valor total do pedido no momento da aplicação. Se o cupom for recusado, o pedido
// não é alterado: segue com o valor que tinha (sem desconto, ou com o cupom anterior).
// US 14: aplicar outro cupom válido substitui o anterior — um pedido tem um cupom só.
// O vínculo cupom → pedido fica em `pedido.cupomAplicado`; o uso só se consolida quando
// o pagamento é aprovado.
export async function aplicarCupom(
  body: AplicarCupomBody,
  agora: Date = new Date(),
): Promise<ResultadoAplicacaoCupom> {
  const codigo = body.codigo?.trim() ?? '';
  if (!codigo) {
    throw new HttpError(400, 'Informe o código do cupom');
  }
  if (!config.cuponsHabilitados) {
    throw new HttpError(400, 'Cupons não estão sendo aceitos no momento');
  }

  const pedido = obterOuCriarPedido(body.pedidoId);
  exigirPedidoEmMontagem(pedido);
  const cupom = cupons.get(codigo.toUpperCase());

  if (!cupom) {
    throw new HttpError(400, `Cupom "${codigo}" inválido ou inativo`);
  }
  validarCupomNoPedido(cupom, pedido, agora);
  if (pedido.pontosUsados && !config.fidelidade.combinaComCupom) {
    throw new HttpError(400, 'Pontos e cupom não podem ser usados no mesmo pedido');
  }

  pedido.cupomAplicado = cupom.codigo;
  pedido.avisoCupom = undefined;
  recalcularPedido(pedido);
  return calcularResultadoCupom(pedido, cupom);
}

// Vigência, usos e as regras que dependem do carrinho: pedido mínimo e, no cupom
// atrelado a itens ou categorias, ter pelo menos um deles no pedido.
export function validarCupomNoPedido(cupom: Cupom, pedido: Pedido, agora: Date = new Date()): void {
  validarCupom(cupom, agora);
  const motivo = motivoCupomNaoServe(pedido, cupom);
  if (motivo) {
    throw new HttpError(400, motivo.charAt(0).toUpperCase() + motivo.slice(1));
  }
}

// US 14: Remover cupom — o pedido volta ao valor integral, sem desconto de cupom.
export async function removerCupom(pedidoId: string): Promise<Pedido> {
  const pedido = obterOuCriarPedido(pedidoId);
  exigirPedidoEmMontagem(pedido);
  pedido.cupomAplicado = undefined;
  pedido.avisoCupom = undefined;
  recalcularPedido(pedido);
  return pedido;
}
