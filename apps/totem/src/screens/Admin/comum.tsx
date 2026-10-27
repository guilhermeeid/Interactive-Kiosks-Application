import { useCallback, useState, type ReactNode } from 'react';
import type { ConfigTotem, MudancaPendente } from '@totem/shared';
import type { AdminApi, FuncionarioApi } from '../../services/adminApi';
import { BotaoTouch } from '../../components/BotaoTouch';
import { PRAZO_ATUALIZACAO_CARDAPIO } from '../../utils/atualizacaoCardapio';
import { redimensionarImagem } from '../../utils/imagem';

// Peças compartilhadas pelas abas da área restrita.

// Abas do modo Administrador.
export interface PropsAba {
  api: AdminApi;
  // A configuração como vai ficar depois do reinício (com o que estiver pendente).
  config: ConfigTotem;
  // Salva a configuração inteira (pendente) e devolve a versão gravada (com ids e
  // textos já normalizados pelo servidor).
  salvarConfig: (config: ConfigTotem) => Promise<ConfigTotem>;
  // Avisa o painel que algo foi salvo, para atualizar a faixa de pendências.
  aoSalvar: () => void;
}

// Abas do modo Funcionário.
export interface PropsAbaFuncionario {
  api: FuncionarioApi;
}

// Item 7: o que o Administrador salva só entra em vigor quando o servidor é reiniciado.
export const SALVO_PENDENTE =
  'Salvo como pendente. Entra em vigor quando o servidor for reiniciado.';

// Item 7 / US 34: o que o Funcionário muda vale na hora.
export const VALE_NA_HORA = `Vale na hora: os totens atualizam o cardápio em até ${PRAZO_ATUALIZACAO_CARDAPIO}.`;

export interface Retorno {
  tipo: 'ok' | 'erro';
  texto: string;
}

// Executa uma chamada à API guardando o resultado para exibir ao administrador.
// `executar` devolve true se deu certo.
export function useAcao() {
  const [retorno, setRetorno] = useState<Retorno | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const executar = useCallback(async (acao: () => Promise<unknown>, sucesso?: string) => {
    setOcupado(true);
    try {
      await acao();
      setRetorno(sucesso ? { tipo: 'ok', texto: sucesso } : null);
      return true;
    } catch (err) {
      setRetorno({ tipo: 'erro', texto: (err as Error).message });
      return false;
    } finally {
      setOcupado(false);
    }
  }, []);

  return { retorno, ocupado, executar };
}

export function MensagemRetorno({ retorno }: { retorno: Retorno | null }) {
  if (!retorno) {
    return null;
  }
  return (
    <p className={retorno.tipo === 'erro' ? 'erro' : 'admin-ok'} role="status">
      {retorno.texto}
    </p>
  );
}

export function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <label className="admin-campo">
      <span className="admin-campo__rotulo">{rotulo}</span>
      {children}
      {dica && <small>{dica}</small>}
    </label>
  );
}

export function Opcao({
  rotulo,
  dica,
  marcado,
  aoMudar,
  travado = false,
}: {
  rotulo: string;
  dica?: string;
  marcado: boolean;
  aoMudar?: (marcado: boolean) => void;
  travado?: boolean;
}) {
  return (
    <label className="admin-opcao">
      <input
        type="checkbox"
        checked={marcado}
        disabled={travado}
        onChange={(evento) => aoMudar?.(evento.target.checked)}
      />
      <span>
        <strong>{rotulo}</strong>
        {dica && <small>{dica}</small>}
      </span>
    </label>
  );
}

// Marca de algo que o Administrador mudou e ainda não está em vigor.
export function SeloPendente({ pendente }: { pendente?: MudancaPendente }) {
  if (!pendente) {
    return null;
  }
  const textos: Record<MudancaPendente, string> = {
    novo: 'Novo · pendente',
    alterado: 'Alterado · pendente',
    removido: 'Sai no reinício',
  };
  return <span className={`selo-pendente selo-pendente--${pendente}`}>{textos[pendente]}</span>;
}

// Envio de imagem (foto, ícone, capa, publicidade): reduz no navegador, envia e devolve
// o endereço gravado no servidor. Sem `aoRemover`, não mostra o botão de tirar.
export function CampoImagem({
  rotulo,
  dica,
  ladoMaximo,
  enviarImagem,
  executar,
  aoEnviar,
  aoRemover,
  rotuloRemover = 'Tirar a imagem',
}: {
  rotulo: string;
  dica?: string;
  ladoMaximo: number;
  enviarImagem: (dataUrl: string) => Promise<{ url: string }>;
  executar: (acao: () => Promise<unknown>) => Promise<boolean>;
  aoEnviar: (url: string) => void;
  aoRemover?: () => void;
  rotuloRemover?: string;
}) {
  return (
    <>
      <Campo rotulo={rotulo} dica={dica}>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            evento.target.value = '';
            if (arquivo) {
              executar(async () => {
                const { url } = await enviarImagem(await redimensionarImagem(arquivo, ladoMaximo));
                aoEnviar(url);
              });
            }
          }}
        />
      </Campo>
      {aoRemover && (
        <BotaoTouch variante="perigo" onClick={aoRemover}>
          {rotuloRemover}
        </BotaoTouch>
      )}
    </>
  );
}
