import type { ReactNode } from 'react';
import { BotaoTouch } from './BotaoTouch';

// Janela por cima da tela, com fundo escurecido. Tocar fora dela ou em "Fechar" fecha.
export interface ModalProps {
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  // Botões extras no rodapé, antes do "Fechar".
  acoes?: ReactNode;
  rotuloFechar?: string;
}

export function Modal({ titulo, aoFechar, children, acoes, rotuloFechar = 'Fechar' }: ModalProps) {
  return (
    <div className="modal" role="presentation" onClick={aoFechar}>
      <div
        className="modal__janela"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(evento) => evento.stopPropagation()}
      >
        <h2 className="modal__titulo">{titulo}</h2>
        <div className="modal__conteudo">{children}</div>
        <div className="modal__acoes">
          {acoes}
          <BotaoTouch onClick={aoFechar}>{rotuloFechar}</BotaoTouch>
        </div>
      </div>
    </div>
  );
}
