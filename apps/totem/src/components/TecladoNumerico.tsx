import { BotaoTouch } from './BotaoTouch';

// Teclado numérico virtual usado para entrada de número de fidelidade (US-04), CPF
// (US-05) e telefone (US-08), já que o totem não tem teclado físico.
// LGPD: dado pessoal — exige consentimento/criptografia (o valor digitado pode ser
// número de fidelidade, CPF ou telefone)
export interface TecladoNumericoProps {
  valor: string;
  onChange: (valor: string) => void;
  tamanhoMaximo?: number;
}

const DIGITOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function TecladoNumerico({ valor, onChange, tamanhoMaximo }: TecladoNumericoProps) {
  function digitar(digito: string) {
    if (tamanhoMaximo && valor.length >= tamanhoMaximo) {
      return;
    }
    onChange(valor + digito);
  }

  function apagar() {
    onChange(valor.slice(0, -1));
  }

  return (
    <div className="teclado-numerico">
      {DIGITOS.map((digito) => (
        <BotaoTouch key={digito} onClick={() => digitar(digito)}>
          {digito}
        </BotaoTouch>
      ))}
      <span />
      <BotaoTouch onClick={() => digitar('0')}>0</BotaoTouch>
      <BotaoTouch onClick={apagar}>⌫</BotaoTouch>
    </div>
  );
}
