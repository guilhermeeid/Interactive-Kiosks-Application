// Tipos referentes a cupons de desconto.
// Consumido por: apps/api/src/modules/cupom, apps/totem/src/screens/Pagamento (US 13, US 24).

export type TipoDescontoCupom = 'percentual' | 'valor_fixo';

export interface Cupom {
  codigo: string;
  tipoDesconto: TipoDescontoCupom;
  valor: number; // percentual (0-100) ou centavos, conforme tipoDesconto
  validoDe?: string; // ISO 8601; início da vigência (inclusivo). Sem valor = já vigente
  validoAte?: string; // ISO 8601; fim da vigência (inclusivo). Sem valor = sem expiração
  ativo: boolean;
}

export interface ResultadoAplicacaoCupom {
  cupom: Cupom;
  descontoCentavos: number;
  valorTotalComDescontoCentavos: number;
}
