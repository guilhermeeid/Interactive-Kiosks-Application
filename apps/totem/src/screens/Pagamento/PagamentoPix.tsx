import { useCallback, useEffect, useRef, useState } from 'react';
import type { CobrancaPix, ConsumoPedido, SituacaoPix } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { CodigoQr } from '../../components/CodigoQr';
import { cancelarPix, consultarPix, escolherFormaPagamento } from '../../services/apiClient';
import { formatarCentavos } from '../../utils/formatarMoeda';

// De quanto em quanto tempo o totem pergunta se o Pix foi pago.
const INTERVALO_CONSULTA_MS = 2_500;

type Estado = 'gerando' | 'aguardando' | 'expirado' | 'instavel';

function mmss(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// US 11: pagamento por Pix com QR Code dinâmico, mesmo com conexão instável.
// - Mostra o QR, o valor e o tempo até expirar; o pagamento é confirmado pelo banco
//   (webhook) e o totem descobre consultando a API a cada poucos segundos.
// - QR expirado: avisa e gera um novo, com o carrinho intacto.
// - Sem resposta do servidor/banco: avisa sobre a instabilidade e oferece tentar de novo.
//   A nova tentativa devolve a mesma cobrança se ela já existia — nunca duas.
// - Queda de conexão com o QR na tela: o QR e o prazo continuam; ao reconectar, um
//   pagamento feito nesse meio-tempo é reconhecido.
export function PagamentoPix({
  pedidoId,
  consumo,
  aoPago,
  aoSair,
}: {
  pedidoId: string;
  consumo: ConsumoPedido;
  aoPago: () => void;
  aoSair: (destino: 'formas' | 'carrinho') => void;
}) {
  const [estado, setEstado] = useState<Estado>('gerando');
  const [pix, setPix] = useState<CobrancaPix | null>(null);
  const [restante, setRestante] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reconectando, setReconectando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  // Fim do prazo no relógio do totem, calculado a partir dos segundos que o servidor
  // informa (o relógio do totem pode estar adiantado ou atrasado).
  const prazo = useRef(0);
  const pago = useRef(false);
  // Guardado em ref para as funções abaixo não mudarem (e o QR não ser pedido de novo) a
  // cada renderização da tela de pagamento.
  const aoPagoRef = useRef(aoPago);
  aoPagoRef.current = aoPago;

  const concluir = useCallback(() => {
    if (!pago.current) {
      pago.current = true;
      aoPagoRef.current();
    }
  }, []);

  const aplicarSituacao = useCallback(
    (situacao: SituacaoPix) => {
      if (situacao.statusPedido === 'pago' || situacao.statusPedido === 'finalizado') {
        concluir();
        return;
      }
      if (situacao.statusPedido === 'aguardando_pix' && situacao.pix) {
        setPix(situacao.pix);
        prazo.current = Date.now() + situacao.segundosRestantes * 1000;
        setEstado('aguardando');
        return;
      }
      // Voltou ao carrinho: o QR expirou (ou foi cancelado) sem pagamento.
      setEstado('expirado');
    },
    [concluir],
  );

  const gerar = useCallback(async () => {
    setEstado('gerando');
    setAviso(null);
    try {
      const resultado = await escolherFormaPagamento(pedidoId, 'pix', consumo);
      if (resultado.status === 'autorizado') {
        concluir();
        return;
      }
      if (resultado.pix) {
        setPix(resultado.pix);
        prazo.current = Date.parse(resultado.pix.expiraEm); // provisório, até a consulta
      }
      aplicarSituacao(await consultarPix(pedidoId));
    } catch (err) {
      setAviso((err as Error).message);
      setEstado('instavel');
    }
  }, [pedidoId, consumo, concluir, aplicarSituacao]);

  // Gera (ou retoma, se já havia um Pix em andamento) o QR ao abrir.
  const iniciado = useRef(false);
  useEffect(() => {
    if (!iniciado.current) {
      iniciado.current = true;
      gerar();
    }
  }, [gerar]);

  // Consulta periódica enquanto o QR está na tela.
  useEffect(() => {
    if (estado !== 'aguardando') return;
    const intervalo = window.setInterval(() => {
      consultarPix(pedidoId)
        .then((situacao) => {
          setReconectando(false);
          aplicarSituacao(situacao);
        })
        .catch(() => setReconectando(true));
    }, INTERVALO_CONSULTA_MS);
    return () => window.clearInterval(intervalo);
  }, [estado, pedidoId, aplicarSituacao]);

  // Contagem regressiva.
  useEffect(() => {
    if (estado !== 'aguardando') return;
    const atualizar = () =>
      setRestante(Math.max(Math.ceil((prazo.current - Date.now()) / 1000), 0));
    atualizar();
    const intervalo = window.setInterval(atualizar, 500);
    return () => window.clearInterval(intervalo);
  }, [estado, pix]);

  // Desistir do Pix cancela a cobrança no banco antes de sair; se ela já tinha sido
  // paga, o pedido segue para a conclusão.
  async function desistir(destino: 'formas' | 'carrinho') {
    setSaindo(true);
    setAviso(null);
    try {
      const situacao = await cancelarPix(pedidoId);
      if (situacao.statusPedido === 'pago' || situacao.statusPedido === 'finalizado') {
        concluir();
        return;
      }
      aoSair(destino);
    } catch (err) {
      setAviso(
        `${(err as Error).message} O Pix ainda não foi cancelado: tente de novo antes de sair.`,
      );
    } finally {
      setSaindo(false);
    }
  }

  const acoesSaida = (
    <div className="tela__acoes">
      <BotaoTouch onClick={() => desistir('carrinho')} disabled={saindo}>
        Voltar ao carrinho
      </BotaoTouch>
      <BotaoTouch onClick={() => desistir('formas')} disabled={saindo}>
        Escolher outra forma de pagamento
      </BotaoTouch>
    </div>
  );

  return (
    <section className="cartao pix" aria-live="polite">
      <h2>⚡ Pagamento por Pix</h2>

      {estado === 'gerando' && <p className="aviso">Gerando o QR Code...</p>}

      {estado === 'aguardando' && pix && (
        <>
          <p className="pix__valor">{formatarCentavos(pix.valorCentavos)}</p>
          <CodigoQr texto={pix.copiaECola} rotulo="QR Code do Pix" />
          <p>Abra o aplicativo do seu banco, escolha Pix e leia o QR Code.</p>
          <p className={restante <= 30 ? 'pix__prazo pix__prazo--fim' : 'pix__prazo'}>
            {restante > 0 ? `Expira em ${mmss(restante)}` : 'Conferindo se o pagamento chegou...'}
          </p>
          {reconectando ? (
            <p className="aviso-cadastro" role="status">
              Conexão instável: reconectando... Se você já pagou, aguarde — o pagamento será
              reconhecido sem nova cobrança.
            </p>
          ) : (
            <p className="aviso">Aguardando a confirmação do banco...</p>
          )}
        </>
      )}

      {estado === 'expirado' && (
        <>
          <p className="aviso-cadastro" role="status">
            O QR Code expirou e nenhum pagamento foi recebido. Seu carrinho continua salvo.
          </p>
          <BotaoTouch variante="primario" onClick={gerar}>
            Gerar novo QR Code
          </BotaoTouch>
        </>
      )}

      {estado === 'instavel' && (
        <>
          <p className="erro" role="alert">
            {aviso}
          </p>
          <BotaoTouch variante="primario" onClick={gerar}>
            Tentar de novo
          </BotaoTouch>
        </>
      )}

      {estado !== 'instavel' && aviso && (
        <p className="erro" role="alert">
          {aviso}
        </p>
      )}
      {estado !== 'gerando' && acoesSaida}
    </section>
  );
}
