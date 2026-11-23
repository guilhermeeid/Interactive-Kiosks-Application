import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemCardapio } from '@totem/shared';
import { buscarCardapio, enviarLeituraNfc, enviarSinalNfc } from '../../services/apiClient';
import './leitor-nfc.css';

// O que vai gravado no cartão: o código interno do item, num registro de texto.
// Espelho de PREFIXO_CODIGO_NFC em apps/api/src/modules/nfc/nfc.service.ts.
const PREFIXO_CODIGO = 'totem-item:';
const INTERVALO_SINAL_MS = 5_000;

type Modo = 'leitor' | 'gravar';
interface Mensagem {
  tipo: 'ok' | 'erro' | 'info';
  texto: string;
}

const suportado = typeof window !== 'undefined' && 'NDEFReader' in window;

function textosDoCartao(evento: NDEFReadingEvent): string[] {
  return evento.message.records
    .filter((registro) => registro.recordType === 'text' && registro.data)
    .map((registro) => new TextDecoder(registro.encoding || 'utf-8').decode(registro.data));
}

function vibrar(padrao: number | number[]) {
  navigator.vibrate?.(padrao);
}

// Página do leitor NFC (endereço /leitor-nfc), aberta no Chrome do celular ligado ao
// notebook por USB-C (`adb reverse tcp:5173` e `tcp:3333`). Módulo opcional do tier
// Intermediário: o totem funciona igual sem ele.
// - Leitor: cada cartão aproximado vai para a API, que descobre o item (código gravado
//   ou número de série cadastrado) e o põe no carrinho do totem.
// - Gravar: escolhe um item e grava o código dele no cartão (regravável). Cartão travado
//   (ex.: de evento) não aceita: cadastre-o na área restrita, aba "Cartões NFC".
export function LeitorNfcScreen() {
  const [ativo, setAtivo] = useState(false);
  const [modo, setModo] = useState<Modo>('leitor');
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [itens, setItens] = useState<ItemCardapio[]>([]);
  const [itemEscolhido, setItemEscolhido] = useState('');
  const [gravando, setGravando] = useState(false);
  const leitor = useRef<NDEFReader | null>(null);
  const modoRef = useRef<Modo>(modo);
  modoRef.current = modo;
  const cancelarGravacao = useRef<AbortController | null>(null);

  // Cardápio para escolher o item a gravar.
  useEffect(() => {
    buscarCardapio()
      .then((lista) => {
        setItens(lista);
        setItemEscolhido((atual) => atual || lista[0]?.id || '');
      })
      .catch(() => setConectado(false));
  }, []);

  // Sinal de vida: o totem mostra "NFC" enquanto ele chega. Só com a página na frente —
  // escondida, o Chrome para de ler o NFC.
  useEffect(() => {
    if (!ativo) return;
    const enviar = () => {
      if (document.visibilityState !== 'visible') return;
      enviarSinalNfc()
        .then(() => setConectado(true))
        .catch(() => setConectado(false));
    };
    enviar();
    const intervalo = window.setInterval(enviar, INTERVALO_SINAL_MS);
    document.addEventListener('visibilitychange', enviar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', enviar);
    };
  }, [ativo]);

  const aoLer = useCallback(async (evento: NDEFReadingEvent) => {
    if (modoRef.current !== 'leitor') return; // gravando: a gravação cuida do cartão
    try {
      const resultado = await enviarLeituraNfc({
        numeroSerie: evento.serialNumber || undefined,
        textos: textosDoCartao(evento),
      });
      setConectado(true);
      if (resultado.tipo === 'item') {
        vibrar(80);
        setMensagem({ tipo: 'ok', texto: `✓ ${resultado.nome} → carrinho do totem` });
      } else if (resultado.tipo === 'cadastrado') {
        vibrar([80, 60, 80]);
        setMensagem({ tipo: 'ok', texto: `✓ Cartão cadastrado como ${resultado.nome}` });
      } else if (resultado.tipo === 'desconhecido') {
        vibrar(300);
        setMensagem({ tipo: 'erro', texto: resultado.motivo });
      }
    } catch (err) {
      setConectado(false);
      setMensagem({ tipo: 'erro', texto: `Não chegou ao totem: ${(err as Error).message}` });
    }
  }, []);

  async function ativar() {
    if (!suportado) return;
    try {
      const novo = new NDEFReader();
      await novo.scan();
      novo.onreading = (evento) => void aoLer(evento);
      novo.onreadingerror = () =>
        setMensagem({ tipo: 'erro', texto: 'Cartão não lido. Aproxime de novo e segure parado.' });
      leitor.current = novo;
      setAtivo(true);
      setMensagem({ tipo: 'info', texto: 'Pronto. Aproxime um cartão da traseira do celular.' });
      // Tela sempre ligada: com a tela apagada o Chrome para de ler.
      await navigator.wakeLock?.request('screen').catch(() => undefined);
    } catch (err) {
      setMensagem({ tipo: 'erro', texto: `${(err as Error).name}: ${(err as Error).message}` });
    }
  }

  async function gravar() {
    const item = itens.find((i) => i.id === itemEscolhido);
    if (!leitor.current || !item) return;
    cancelarGravacao.current = new AbortController();
    setGravando(true);
    setMensagem({ tipo: 'info', texto: `Aproxime o cartão para gravar "${item.nome}"...` });
    try {
      await leitor.current.write(
        { records: [{ recordType: 'text', lang: 'pt', data: `${PREFIXO_CODIGO}${item.id}` }] },
        { signal: cancelarGravacao.current.signal },
      );
      vibrar([80, 60, 80]);
      setMensagem({
        tipo: 'ok',
        texto: `✓ Cartão gravado como "${item.nome}". Volte ao modo Leitor para usar.`,
      });
    } catch (err) {
      const erro = err as Error;
      setMensagem(
        erro.name === 'AbortError'
          ? { tipo: 'info', texto: 'Gravação cancelada.' }
          : {
              tipo: 'erro',
              texto:
                'Este cartão não aceita gravação (provavelmente travado, como cartões de ' +
                'evento). Cadastre-o na área restrita, aba "Cartões NFC".',
            },
      );
    } finally {
      setGravando(false);
      cancelarGravacao.current = null;
    }
  }

  function trocarModo(novo: Modo) {
    cancelarGravacao.current?.abort();
    setModo(novo);
    setMensagem(null);
  }

  return (
    <div className="leitor-nfc">
      <h1>📶 Leitor NFC do totem</h1>

      <p className={`leitor-nfc__status leitor-nfc__status--${conectado ? 'ok' : 'erro'}`}>
        {conectado === null && 'Conferindo a conexão com o totem...'}
        {conectado === true && '● Conectado ao totem pelo cabo'}
        {conectado === false &&
          '● Sem conexão com o totem. Confira o cabo e o "adb reverse" (README).'}
      </p>

      {!suportado ? (
        <p className="leitor-nfc__mensagem leitor-nfc__mensagem--erro">
          Este navegador não tem Web NFC. Use o Chrome no Android, no endereço
          http://localhost:5173/leitor-nfc.
        </p>
      ) : !ativo ? (
        <button type="button" className="leitor-nfc__botao" onClick={ativar}>
          Ativar leitor
        </button>
      ) : (
        <>
          <div className="leitor-nfc__modos" role="group" aria-label="Modo">
            <button
              type="button"
              aria-pressed={modo === 'leitor'}
              onClick={() => trocarModo('leitor')}
            >
              Leitor
            </button>
            <button
              type="button"
              aria-pressed={modo === 'gravar'}
              onClick={() => trocarModo('gravar')}
            >
              Gravar cartão
            </button>
          </div>

          {modo === 'leitor' ? (
            <p className="leitor-nfc__dica">
              Aproxime o cartão do item: ele entra no carrinho do totem (cardápio ou carrinho
              abertos).
            </p>
          ) : (
            <div className="leitor-nfc__gravar">
              <label>
                Item do cartão
                <select
                  value={itemEscolhido}
                  onChange={(evento) => setItemEscolhido(evento.target.value)}
                  disabled={gravando}
                >
                  {itens.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                    </option>
                  ))}
                </select>
              </label>
              {gravando ? (
                <button
                  type="button"
                  className="leitor-nfc__botao leitor-nfc__botao--secundario"
                  onClick={() => cancelarGravacao.current?.abort()}
                >
                  Cancelar
                </button>
              ) : (
                <button
                  type="button"
                  className="leitor-nfc__botao"
                  onClick={gravar}
                  disabled={!itemEscolhido}
                >
                  Gravar no próximo cartão
                </button>
              )}
              <p className="leitor-nfc__dica">
                O cartão pode ser regravado quantas vezes quiser (o que era suco vira sorvete).
              </p>
            </div>
          )}
        </>
      )}

      {mensagem && (
        <p className={`leitor-nfc__mensagem leitor-nfc__mensagem--${mensagem.tipo}`} role="status">
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
