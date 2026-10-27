import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useConfig, useTermoConsentimento } from '../contexts/ConfigContext';
import { usePedido } from '../contexts/PedidoContext';
import {
  aplicarCupom,
  informarFidelidadePorQr,
  registrarConsentimentos,
} from '../services/apiClient';
import { formatarCentavos } from '../utils/formatarMoeda';
import type { LeituraCodigo } from '../utils/leituraCodigo';
import type { ResultadoDaLeitura } from '../utils/leituraCodigo.worker';
import { interpretarCodigo } from '../utils/qr';
import { AvisoConsentimento } from './AvisoConsentimento';
import { BotaoTouch } from './BotaoTouch';
import { Modal } from './Modal';

// Lado máximo do quadro analisado: o código de barras precisa da resolução cheia da
// câmera, senão as barras finas se fundem.
const LADO_ANALISE = 1280;
const INTERVALO_LEITURA_MS = 100;
// Depois de "Ler outro código", um respiro para o cliente tirar o código anterior da
// frente da câmera.
const RESPIRO_MS = 1200;

// Mostra a câmera e entrega o primeiro código (QR ou de barras) que aparecer. Para de
// analisar depois de uma leitura e enquanto `pausado` estiver ligado.
function VisorCamera({
  aoLer,
  pausado,
}: {
  aoLer: (leitura: LeituraCodigo) => void;
  pausado: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const aoLerRef = useRef(aoLer);
  const pausadoRef = useRef(pausado);
  const esperarAte = useRef(0);

  useEffect(() => {
    aoLerRef.current = aoLer;
  }, [aoLer]);

  useLayoutEffect(() => {
    pausadoRef.current = pausado;
    if (!pausado) esperarAte.current = Date.now() + RESPIRO_MS;
  }, [pausado]);

  useEffect(() => {
    let ativo = true;
    let fluxo: MediaStream | null = null;
    let espera = 0;
    const canvas = document.createElement('canvas');
    const contexto = canvas.getContext('2d', { willReadFrequently: true });

    // A análise roda num Web Worker; se ele não carregar, roda aqui mesmo (com os
    // leitores baixados só nesse caso, para não pesar a tela do totem).
    let trabalhador: Worker | null = null;
    try {
      trabalhador = new Worker(new URL('../utils/leituraCodigo.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      trabalhador = null;
    }

    const analisar = (quadro: ImageData): Promise<LeituraCodigo | null> => {
      const atual = trabalhador;
      if (!atual) {
        return import('../utils/leituraCodigo').then(({ lerCodigoNoQuadro }) =>
          lerCodigoNoQuadro(quadro.data, quadro.width, quadro.height),
        );
      }
      return new Promise((resolver) => {
        atual.onmessage = (evento: MessageEvent<ResultadoDaLeitura>) =>
          resolver(evento.data.leitura);
        atual.onerror = () => {
          atual.terminate();
          trabalhador = null;
          resolver(null);
        };
        atual.postMessage({ rgba: quadro.data, largura: quadro.width, altura: quadro.height }, [
          quadro.data.buffer,
        ]);
      });
    };

    const ler = async () => {
      const visor = video.current;
      if (!ativo || !visor || !contexto) return;
      const pronto = visor.readyState >= 2 && visor.videoWidth > 0;
      if (pronto && !pausadoRef.current && Date.now() >= esperarAte.current) {
        const escala = Math.min(1, LADO_ANALISE / visor.videoWidth);
        canvas.width = Math.round(visor.videoWidth * escala);
        canvas.height = Math.round(visor.videoHeight * escala);
        contexto.drawImage(visor, 0, 0, canvas.width, canvas.height);
        const leitura = await analisar(contexto.getImageData(0, 0, canvas.width, canvas.height));
        if (!ativo) return;
        if (leitura && !pausadoRef.current) {
          pausadoRef.current = true;
          aoLerRef.current(leitura);
        }
      }
      espera = window.setTimeout(ler, INTERVALO_LEITURA_MS);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro('Este totem não tem câmera disponível.');
        return;
      }
      try {
        // Resolução maior ajuda nas barras finas; a câmera entrega o que conseguir.
        fluxo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        setErro('Não foi possível usar a câmera. Confira a permissão do navegador.');
        return;
      }
      if (!ativo || !video.current) {
        fluxo.getTracks().forEach((faixa) => faixa.stop());
        return;
      }
      video.current.srcObject = fluxo;
      await video.current.play().catch(() => undefined);
      ler();
    })();

    return () => {
      ativo = false;
      window.clearTimeout(espera);
      trabalhador?.terminate();
      fluxo?.getTracks().forEach((faixa) => faixa.stop());
    };
  }, []);

  return erro ? (
    <p className="erro">{erro}</p>
  ) : (
    <div className={pausado ? 'leitor-codigo leitor-codigo--pausado' : 'leitor-codigo'}>
      <video ref={video} muted playsInline aria-label="Imagem da câmera" />
      <span className="leitor-codigo__mira" aria-hidden="true" />
    </div>
  );
}

type Estado =
  | { tipo: 'lendo' }
  | { tipo: 'processando' }
  | { tipo: 'cartao'; codigo: string } // cartão lido; falta o consentimento
  | { tipo: 'falha'; mensagem: string; deCupom: boolean };

// Câmera do totem.
// US 18: o QR Code ou o código de barras de um cupom impresso aplica o desconto na hora.
// Código não reconhecido (ou cupom recusado) mostra o aviso e deixa o cliente seguir sem
// o cupom ou ler outro código.
// Também lê o QR do cartão de fidelidade (identifica o cliente, depois do consentimento).
export function LeitorCodigo({
  aoFechar,
  aoResultado,
}: {
  aoFechar: () => void;
  // Frase para a tela mostrar depois que a janela fecha com sucesso.
  aoResultado: (mensagem: string) => void;
}) {
  const { fidelidade } = useConfig();
  const termo = useTermoConsentimento();
  const { pedidoId, pedido, recarregarPedido, definirClienteFidelidade } = usePedido();
  const [estado, setEstado] = useState<Estado>({ tipo: 'lendo' });
  const [aceitou, setAceitou] = useState(false);

  const concluir = useCallback(
    (mensagem: string) => {
      aoResultado(mensagem);
      aoFechar();
    },
    [aoResultado, aoFechar],
  );

  const identificar = useCallback(
    async (codigo: string) => {
      const cliente = await informarFidelidadePorQr(pedidoId, codigo);
      definirClienteFidelidade(cliente);
      await recarregarPedido();
      concluir(
        `Cartão de fidelidade lido. Seu saldo: ${cliente.pontos.toLocaleString('pt-BR')} pontos.`,
      );
    },
    [pedidoId, definirClienteFidelidade, recarregarPedido, concluir],
  );

  const aoLer = useCallback(
    async ({ conteudo }: LeituraCodigo) => {
      setEstado({ tipo: 'processando' });
      const leitura = interpretarCodigo(conteudo);

      if (leitura.tipo === 'cupom') {
        try {
          const { descontoCentavos } = await aplicarCupom(pedidoId, leitura.codigo);
          await recarregarPedido();
          concluir(
            descontoCentavos > 0
              ? `Cupom ${leitura.codigo} aplicado: − ${formatarCentavos(descontoCentavos)}.`
              : `Cupom ${leitura.codigo} aplicado.`,
          );
        } catch (err) {
          setEstado({ tipo: 'falha', mensagem: (err as Error).message, deCupom: true });
        }
        return;
      }

      if (leitura.tipo === 'fidelidade') {
        const decisao = pedido?.consentimentos?.fidelidade;
        if (!fidelidade.habilitado) {
          setEstado({
            tipo: 'falha',
            mensagem: 'O programa de fidelidade não está disponível.',
            deCupom: false,
          });
        } else if (decisao === false) {
          // US 10: o que o cliente recusou não volta a ser pedido neste pedido.
          setEstado({
            tipo: 'falha',
            mensagem: 'Você optou por seguir sem fidelidade neste pedido.',
            deCupom: false,
          });
        } else if (decisao === true) {
          await identificar(leitura.codigo).catch((err: Error) =>
            setEstado({ tipo: 'falha', mensagem: err.message, deCupom: false }),
          );
        } else {
          setEstado({ tipo: 'cartao', codigo: leitura.codigo });
        }
        return;
      }

      setEstado({
        tipo: 'falha',
        mensagem: 'Código não reconhecido. Ele não é de um cupom nem de um cartão de fidelidade.',
        deCupom: true,
      });
    },
    [pedidoId, pedido, fidelidade.habilitado, recarregarPedido, concluir, identificar],
  );

  async function confirmarConsentimento() {
    if (estado.tipo !== 'cartao') return;
    const { codigo } = estado;
    setEstado({ tipo: 'processando' });
    try {
      await registrarConsentimentos(pedidoId, termo.versao, { fidelidade: true });
      await identificar(codigo);
    } catch (err) {
      setEstado({ tipo: 'falha', mensagem: (err as Error).message, deCupom: false });
    }
  }

  const titulo =
    estado.tipo === 'cartao'
      ? 'Cartão de fidelidade'
      : estado.tipo === 'falha'
        ? 'Não deu para usar este código'
        : 'Mostre o QR Code ou o código de barras';

  return (
    <Modal
      titulo={titulo}
      aoFechar={aoFechar}
      rotuloFechar={estado.tipo === 'falha' && estado.deCupom ? 'Seguir sem o cupom' : 'Cancelar'}
      acoes={
        estado.tipo === 'cartao' ? (
          <BotaoTouch variante="primario" onClick={confirmarConsentimento} disabled={!aceitou}>
            Usar meu cartão
          </BotaoTouch>
        ) : (
          estado.tipo === 'falha' && (
            <BotaoTouch variante="primario" onClick={() => setEstado({ tipo: 'lendo' })}>
              Ler outro código
            </BotaoTouch>
          )
        )
      }
    >
      {estado.tipo === 'cartao' ? (
        <AvisoConsentimento
          termo={termo}
          finalidades={['fidelidade']}
          aceites={{ fidelidade: aceitou }}
          aoMudar={(_finalidade, aceito) => setAceitou(aceito)}
        />
      ) : (
        <>
          <VisorCamera aoLer={aoLer} pausado={estado.tipo !== 'lendo'} />
          {estado.tipo === 'falha' ? (
            <div className="leitor-codigo__falha" role="alert">
              <p className="erro">⚠️ {estado.mensagem}</p>
              {estado.deCupom && (
                <p className="aviso">Você pode seguir sem o cupom ou ler outro código.</p>
              )}
            </div>
          ) : (
            <p className="aviso">
              {estado.tipo === 'processando'
                ? 'Conferindo o código...'
                : 'Cupom (QR Code ou código de barras) ou o QR do seu cartão de fidelidade. Aproxime até o código ocupar a moldura.'}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
