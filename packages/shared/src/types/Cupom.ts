// Tipos referentes a cupons de desconto.
// Consumido por: apps/api/src/modules/cupom, apps/totem/src/screens/Pagamento (US 13, US 24).

export type TipoDescontoCupom = 'percentual' | 'valor_fixo';

export interface Cupom {
  codigo: string;
  tipoDesconto: TipoDescontoCupom;
  valor: number; // percentual (0-100) ou centavos, conforme tipoDesconto
  validoDe?: string; // ISO 8601; início da vigência (inclusivo). Sem valor = já vigente
  validoAte?: string; // ISO 8601; fim da vigência (inclusivo). Sem valor = sem expiração
  limiteUsos?: number; // quantos pedidos pagos podem usar o cupom. Sem valor = sem limite
  usos?: number; // pedidos pagos que já usaram o cupom
  ativo: boolean;
}

// Por que um cupom é (ou não é) aceito no totem neste momento. Só `valido` é aceito.
export type SituacaoCupom = 'valido' | 'inativo' | 'nao_vigente' | 'expirado' | 'esgotado';

// Cupom como a tela de administrador o lista: atributos + situação calculada no servidor.
export interface CupomComSituacao extends Cupom {
  situacao: SituacaoCupom;
}

export interface ResultadoAplicacaoCupom {
  cupom: Cupom;
  descontoCentavos: number;
  valorTotalComDescontoCentavos: number;
}
