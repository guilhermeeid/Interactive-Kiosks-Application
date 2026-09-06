// Tipos referentes a cupons de desconto.
// Consumido por: apps/api/src/modules/cupom, apps/totem/src/screens/Pagamento (US-07).

export type TipoDescontoCupom = 'percentual' | 'valor_fixo';

export interface Cupom {
  codigo: string;
  tipoDesconto: TipoDescontoCupom;
  valor: number; // percentual (0-100) ou centavos, conforme tipoDesconto
  validoAte?: string;
  ativo: boolean;
}

export interface ResultadoAplicacaoCupom {
  cupom: Cupom;
  descontoCentavos: number;
  valorTotalComDescontoCentavos: number;
}
