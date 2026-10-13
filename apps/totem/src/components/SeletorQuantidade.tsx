import { BotaoTouch } from './BotaoTouch';

// Seletor "− quantidade +" usado no cardápio (escolher quantas unidades adicionar) e
// no carrinho (alterar a quantidade de um item).
export interface SeletorQuantidadeProps {
  valor: number;
  nomeItem: string;
  minimo?: number;
  // Limite vindo do estoque do item; ausente = sem limite.
  maximo?: number;
  aoMudar: (valor: number) => void;
  // Chamado quando o cliente toca no "+" já no limite, para a tela explicar o motivo.
  aoTocarNoLimite?: () => void;
}

export function SeletorQuantidade({
  valor,
  nomeItem,
  minimo = 0,
  maximo,
  aoMudar,
  aoTocarNoLimite,
}: SeletorQuantidadeProps) {
  const noLimite = maximo !== undefined && valor >= maximo;

  return (
    <div className="quantidade">
      <BotaoTouch
        aria-label={`Diminuir ${nomeItem}`}
        onClick={() => aoMudar(valor - 1)}
        disabled={valor <= minimo}
      >
        −
      </BotaoTouch>
      <span className="quantidade__valor">{valor}</span>
      {/* No limite o "+" fica opaco, mas segue tocável: o toque mostra o aviso de que
          o produto acabou em vez de simplesmente não responder. */}
      <BotaoTouch
        aria-label={`Aumentar ${nomeItem}`}
        aria-disabled={noLimite}
        className={noLimite ? 'botao--inativo' : undefined}
        onClick={() => (noLimite ? aoTocarNoLimite?.() : aoMudar(valor + 1))}
      >
        +
      </BotaoTouch>
    </div>
  );
}
