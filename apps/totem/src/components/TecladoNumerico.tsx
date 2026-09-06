// Teclado numérico virtual usado para entrada de CPF (US-05) e número de fidelidade
// (US-04), já que o totem não tem teclado físico.
// LGPD: dado pessoal — exige consentimento/criptografia (valor digitado pode ser CPF
// ou número de fidelidade)
export interface TecladoNumericoProps {
  valor: string;
  onChange: (valor: string) => void;
  tamanhoMaximo?: number;
}

// TODO: implementar layout do teclado (0-9, apagar, confirmar) e a lógica de
// digitação, respeitando `tamanhoMaximo`.
export function TecladoNumerico(props: TecladoNumericoProps) {
  return null;
}
