// Tipos referentes a cupons de desconto.
// Consumido por: apps/api/src/modules/cupom, apps/totem/src/screens/Carrinho (US 13, US 24).

export type TipoDescontoCupom = 'percentual' | 'valor_fixo';

// Cupom que vale só para alguns itens ou categorias: o desconto incide apenas sobre o
// valor desses itens no carrinho.
export interface RestricaoCupom {
  tipo: 'itens' | 'categorias';
  ids: string[];
}

export interface Cupom {
  codigo: string;
  tipoDesconto: TipoDescontoCupom;
  valor: number; // percentual (0-100) ou centavos, conforme tipoDesconto
  validoDe?: string; // ISO 8601; início da vigência (inclusivo). Sem valor = já vigente
  validoAte?: string; // ISO 8601; fim da vigência (inclusivo). Sem valor = sem expiração
  limiteUsos?: number; // quantos pedidos pagos podem usar o cupom. Sem valor = sem limite
  usos?: number; // pedidos pagos que já usaram o cupom
  aplicaEm?: RestricaoCupom; // sem valor = vale para o pedido inteiro
  pedidoMinimoCentavos?: number; // subtotal mínimo do pedido para o cupom valer
  descontoMaximoCentavos?: number; // teto do desconto (cupom percentual)
  ativo: boolean;
}

// Por que um cupom é (ou não é) aceito no totem neste momento. Só `valido` é aceito.
// `sem_desconto`: valor zero, negativo ou fora do permitido (US 36) — só acontece com
// cupom gravado por fora da área restrita, que já recusa esses valores.
export type SituacaoCupom =
  'valido' | 'sem_desconto' | 'inativo' | 'nao_vigente' | 'expirado' | 'esgotado';

// Cupom como a tela de administrador o lista: atributos + situação calculada no servidor.
export interface CupomComSituacao extends Cupom {
  situacao: SituacaoCupom;
}

export interface ResultadoAplicacaoCupom {
  cupom: Cupom;
  descontoCentavos: number;
  valorTotalComDescontoCentavos: number;
}
