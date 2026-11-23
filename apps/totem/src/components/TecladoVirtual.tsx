import { BotaoTouch } from './BotaoTouch';

// Teclado alfanumérico virtual (US 02 busca, US 13 cupom), já que o totem não tem
// teclado físico. Com `maiusculas`, as letras digitadas saem em caixa alta. `email`
// troca a barra de espaço por @ . _ - e atalhos de domínio (comprovante por e-mail).
export interface TecladoVirtualProps {
  valor: string;
  onChange: (valor: string) => void;
  tamanhoMaximo?: number;
  maiusculas?: boolean;
  email?: boolean;
  desabilitado?: boolean;
}

const TECLAS_EMAIL = ['@', '.', '_', '-', '.com', '.com.br', '@gmail.com'];

const LINHAS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export function TecladoVirtual({
  valor,
  onChange,
  tamanhoMaximo = 40,
  maiusculas = false,
  email = false,
  desabilitado = false,
}: TecladoVirtualProps) {
  function digitar(caractere: string) {
    if (valor.length + caractere.length > tamanhoMaximo) {
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
              disabled={desabilitado}
              onClick={() => digitar(maiusculas ? letra : letra.toLowerCase())}
            >
              {letra}
            </BotaoTouch>
          ))}
        </div>
      ))}
      <div className="teclado-virtual__linha">
        {email ? (
          TECLAS_EMAIL.map((tecla) => (
            <BotaoTouch key={tecla} disabled={desabilitado} onClick={() => digitar(tecla)}>
              {tecla}
            </BotaoTouch>
          ))
        ) : (
          <BotaoTouch
            className="teclado-virtual__espaco"
            disabled={desabilitado}
            onClick={() => digitar(' ')}
          >
            espaço
          </BotaoTouch>
        )}
        <BotaoTouch disabled={desabilitado} onClick={() => onChange(valor.slice(0, -1))}>
          ⌫
        </BotaoTouch>
      </div>
    </div>
  );
}
