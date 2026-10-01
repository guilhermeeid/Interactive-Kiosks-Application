import { BotaoTouch } from './BotaoTouch';

// Teclado alfanumérico virtual (US 02 busca, US 13 cupom), já que o totem não tem
// teclado físico. Com `maiusculas`, as letras digitadas saem em caixa alta.
export interface TecladoVirtualProps {
  valor: string;
  onChange: (valor: string) => void;
  tamanhoMaximo?: number;
  maiusculas?: boolean;
}

const LINHAS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export function TecladoVirtual({
  valor,
  onChange,
  tamanhoMaximo = 40,
  maiusculas = false,
}: TecladoVirtualProps) {
  function digitar(caractere: string) {
    if (valor.length >= tamanhoMaximo) {
      return;
    }
    onChange(valor + caractere);
  }

  return (
    <div className="teclado-virtual">
      {LINHAS.map((linha) => (
        <div key={linha} className="teclado-virtual__linha">
          {[...linha].map((letra) => (
            <BotaoTouch
              key={letra}
              onClick={() => digitar(maiusculas ? letra : letra.toLowerCase())}
            >
              {letra}
            </BotaoTouch>
          ))}
        </div>
      ))}
      <div className="teclado-virtual__linha">
        <BotaoTouch className="teclado-virtual__espaco" onClick={() => digitar(' ')}>
          espaço
        </BotaoTouch>
        <BotaoTouch onClick={() => onChange(valor.slice(0, -1))}>⌫</BotaoTouch>
      </div>
    </div>
  );
}
