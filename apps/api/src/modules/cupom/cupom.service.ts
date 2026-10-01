import type { Cupom, ResultadoAplicacaoCupom } from '@totem/shared';
import { calcularResultadoCupom, cupons, obterOuCriarPedido } from '../../db/memory-store';
import { HttpError } from '../../errors';
import type { AplicarCupomBody } from './cupom.types';

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// US 24: Regras de validade de cupom. O cupom só vale entre `validoDe` e `validoAte`,
// ambos inclusivos e opcionais (sem data = sem limite naquele lado).
export function validarVigenciaCupom(cupom: Cupom, agora: Date = new Date()): void {
  if (!cupom.ativo) {
    throw new HttpError(400, `Cupom "${cupom.codigo}" inválido ou inativo`);
  }
  if (cupom.validoDe && new Date(cupom.validoDe).getTime() > agora.getTime()) {
    throw new HttpError(
      400,
      `Cupom "${cupom.codigo}" ainda não está válido (a partir de ${formatarData(cupom.validoDe)})`,
    );
  }
  if (cupom.validoAte && new Date(cupom.validoAte).getTime() < agora.getTime()) {
    throw new HttpError(400, `Cupom "${cupom.codigo}" expirado`);
  }
}

// US 13: Aplicar cupom — valida código/vigência e calcula o desconto sobre o
// valor total do pedido no momento da aplicação. Se o cupom for recusado, o pedido
// não é alterado e segue sem desconto. O vínculo cupom → pedido fica em
// `pedido.cupomAplicado`; o uso só se consolida quando o pagamento é aprovado.
export async function aplicarCupom(
  body: AplicarCupomBody,
  agora: Date = new Date(),
): Promise<ResultadoAplicacaoCupom> {
  const codigo = body.codigo?.trim() ?? '';
  if (!codigo) {
    throw new HttpError(400, 'Informe o código do cupom');
  }

  const pedido = obterOuCriarPedido(body.pedidoId);
  const cupom = cupons.get(codigo.toUpperCase());

  if (!cupom) {
    throw new HttpError(400, `Cupom "${codigo}" inválido ou inativo`);
  }
  validarVigenciaCupom(cupom, agora);

  pedido.cupomAplicado = cupom.codigo;
  return calcularResultadoCupom(pedido, cupom);
}
