import { useEffect, useState } from 'react';
import type { Comprovante } from '@totem/shared';
import { ErroApi, obterComprovante } from '../services/apiClient';
import { BotaoTouch } from './BotaoTouch';
import { CodigoQr } from './CodigoQr';

// A nota pode levar alguns segundos depois da confirmação do Pix (o banco avisa, a API
// emite): enquanto ela não existe, o totem pergunta de novo.
const TENTATIVAS = 10;
const INTERVALO_MS = 1_500;

// Chave de acesso em blocos de 4 dígitos, como impressa no DANFE.
function chaveEmBlocos(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, '$1 ');
}

// NFC-e do pedido pago, lida da API (o comprovante que o totem vê nunca traz e-mail ou
// telefone, e o CPF vem mascarado).
export function useNotaFiscal(pedidoId: string, ativo: boolean) {
  const [comprovante, setComprovante] = useState<Comprovante | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    let espera: number | undefined;
    setIndisponivel(false);
    const buscar = (tentativa: number) => {
      obterComprovante(pedidoId)
        .then((resposta) => {
          if (!cancelado) setComprovante(resposta);
        })
        .catch((err) => {
          if (cancelado) return;
          const aindaEmitindo = err instanceof ErroApi && (err.status === 404 || err.status === 0);
          if (aindaEmitindo && tentativa < TENTATIVAS) {
            espera = window.setTimeout(() => buscar(tentativa + 1), INTERVALO_MS);
          } else {
            setIndisponivel(true);
          }
        });
    };
    buscar(1);
    return () => {
      cancelado = true;
      window.clearTimeout(espera);
    };
  }, [pedidoId, ativo, recarga]);

  return { comprovante, indisponivel, tentarDeNovo: () => setRecarga((atual) => atual + 1) };
}

// US 15: a NFC-e na tela, com o QR Code de consulta — o registro fiscal fica com o
// cliente mesmo sem impressão e antes do e-mail ou SMS. Erro fiscal não esconde o
// pedido: o número continua na tela e a falha fica registrada para a loja reemitir.
export function NotaFiscalNaTela({
  comprovante,
  indisponivel,
  tentarDeNovo,
}: ReturnType<typeof useNotaFiscal>) {
  const nota = comprovante?.nota;

  if (indisponivel) {
    return (
      <section className="cartao nota-fiscal">
        <h2>🧾 Nota fiscal (NFC-e)</h2>
        <p className="aviso">Não foi possível carregar a nota agora.</p>
        <BotaoTouch onClick={tentarDeNovo}>Tentar de novo</BotaoTouch>
      </section>
    );
  }
  if (!nota) {
    return (
      <section className="cartao nota-fiscal">
        <h2>🧾 Nota fiscal (NFC-e)</h2>
        <p className="aviso">Emitindo a nota fiscal...</p>
      </section>
    );
  }
  if (nota.status === 'falha') {
    return (
      <section className="cartao nota-fiscal" role="status">
        <h2>🧾 Nota fiscal (NFC-e)</h2>
        <p className="aviso-cadastro">
          Seu pedido está pago e confirmado, mas a nota fiscal não pôde ser emitida agora. A loja já
          foi avisada e vai emiti-la; se precisar dela, peça no balcão informando o número do
          pedido.
        </p>
      </section>
    );
  }
  return (
    <section className="cartao nota-fiscal">
      <h2>🧾 Nota fiscal (NFC-e) autorizada</h2>
      <div className="nota-fiscal__corpo">
        {nota.urlConsulta && (
          <CodigoQr texto={nota.urlConsulta} rotulo="QR Code de consulta da nota fiscal" />
        )}
        <div>
          <p>
            <strong>
              NFC-e nº {nota.numero}
              {nota.serie && ` · série ${nota.serie}`}
            </strong>
          </p>
          {comprovante?.cpfNaNotaMascarado && (
            <p>CPF do consumidor: {comprovante.cpfNaNotaMascarado}</p>
          )}
          <p className="aviso">Aponte a câmera do celular para o QR Code e consulte a nota.</p>
          {nota.chaveAcesso && (
            <p className="nota">Chave de acesso: {chaveEmBlocos(nota.chaveAcesso)}</p>
          )}
        </div>
      </div>
    </section>
  );
}
