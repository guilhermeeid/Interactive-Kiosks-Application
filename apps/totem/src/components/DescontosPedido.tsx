import { useCallback, useRef, useState } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { usePedido } from '../contexts/PedidoContext';
import { useAvisoTemporario } from '../hooks/useAvisoTemporario';
import { useFecharAoTocarFora } from '../hooks/useFecharAoTocarFora';
import { aplicarCupom, removerCupom, usarPontos } from '../services/apiClient';
import { BotaoTouch } from './BotaoTouch';
import { LeitorCodigo } from './LeitorCodigo';
import { TecladoNumerico } from './TecladoNumerico';
import { TecladoVirtual } from './TecladoVirtual';

// Executa uma mudança de desconto e recarrega o pedido, de onde saem os valores: a tela
// nunca calcula o total por conta própria.
function useAlterarDesconto() {
  const { recarregarPedido } = usePedido();
  return useCallback(
    async (acao: () => Promise<unknown>, aoFalhar: (mensagem: string) => void) => {
      try {
        await acao();
      } catch (err) {
        aoFalhar((err as Error).message);
      }
      await recarregarPedido().catch(() => undefined);
    },
    [recarregarPedido],
  );
}

// US 13 / US 14: cupom de desconto. Com um cupom aplicado, dá para removê-lo (volta o
// valor integral) ou digitar outro código, que substitui o atual se for válido. Cupom
// recusado não altera o pedido.
// US 18: o cupom impresso também pode ser lido pela câmera (QR Code ou código de barras).
export function SecaoCupom() {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [tecladoAberto, setTecladoAberto] = useState(false);
  const [leitorAberto, setLeitorAberto] = useState(false);
  const [aviso, mostrarAviso] = useAvisoTemporario();
  const campoRef = useRef<HTMLDivElement>(null);
  const { pedidoId, pedido } = usePedido();
  const alterarDesconto = useAlterarDesconto();

  const fecharTeclado = useCallback(() => setTecladoAberto(false), []);
  useFecharAoTocarFora(campoRef, tecladoAberto, fecharTeclado);

  function aplicar() {
    setErro(null);
    setTecladoAberto(false);
    return alterarDesconto(async () => {
      await aplicarCupom(pedidoId, codigo);
      setCodigo('');
    }, setErro);
  }

  return (
    <section className="cartao">
      <h2>🏷️ Cupom de desconto</h2>
      {/* O cupom saiu sozinho porque o carrinho deixou de cumprir a regra dele. */}
      {pedido?.avisoCupom && <p className="aviso-cadastro">{pedido.avisoCupom}</p>}
      {pedido?.cupomAplicado && (
        <div className="desconto-aplicado">
          <p className="desconto">Cupom {pedido.cupomAplicado} aplicado</p>
          <BotaoTouch
            variante="perigo"
            onClick={() => alterarDesconto(() => removerCupom(pedidoId), setErro)}
          >
            Remover
          </BotaoTouch>
        </div>
      )}
      <div ref={campoRef}>
        <div className="cupom">
          <input
            readOnly
            value={codigo}
            onClick={() => setTecladoAberto(true)}
            onFocus={() => setTecladoAberto(true)}
            placeholder={pedido?.cupomAplicado ? 'Trocar por outro cupom' : 'Código do cupom'}
            aria-label="Código do cupom"
          />
          {codigo && (
            <BotaoTouch variante="perigo" onClick={() => setCodigo('')}>
              Limpar
            </BotaoTouch>
          )}
          <BotaoTouch variante="destaque" onClick={aplicar} disabled={!codigo.trim()}>
            {pedido?.cupomAplicado ? 'Trocar' : 'Aplicar'}
          </BotaoTouch>
        </div>
        {tecladoAberto && <TecladoVirtual valor={codigo} onChange={setCodigo} maiusculas />}
      </div>
      <BotaoTouch className="botao-camera" onClick={() => setLeitorAberto(true)}>
        📷 Ler cupom pela câmera
      </BotaoTouch>
      {erro && <p className="erro">{erro}</p>}
      {aviso && (
        <p className="aviso-flutuante" role="status">
          {aviso}
        </p>
      )}
      {leitorAberto && (
        <LeitorCodigo aoFechar={() => setLeitorAberto(false)} aoResultado={mostrarAviso} />
      )}
    </section>
  );
}

// Pontos de fidelidade como desconto. Só aparece para quem se identificou com um CPF
// cadastrado; o servidor recusa (e explica) se o cliente pedir mais pontos do que tem.
export function SecaoPontos() {
  const [pontos, setPontos] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [tecladoAberto, setTecladoAberto] = useState(false);
  const campoRef = useRef<HTMLDivElement>(null);
  const { fidelidade } = useConfig();
  const { pedidoId, pedido, clienteFidelidade } = usePedido();
  const alterarDesconto = useAlterarDesconto();

  const fecharTeclado = useCallback(() => setTecladoAberto(false), []);
  useFecharAoTocarFora(campoRef, tecladoAberto, fecharTeclado);

  if (!fidelidade.habilitado || !clienteFidelidade) {
    return null;
  }

  function aplicar() {
    setErro(null);
    setTecladoAberto(false);
    return alterarDesconto(async () => {
      await usarPontos(pedidoId, Number(pontos));
      setPontos('');
    }, setErro);
  }

  return (
    <section className="cartao">
      <h2>⭐ Pontos de fidelidade</h2>
      <p className="saldo-pontos">
        Seu saldo: <strong>{clienteFidelidade.pontos.toLocaleString('pt-BR')} pontos</strong> (
        {fidelidade.pontosPorReal.toLocaleString('pt-BR')} pontos = R$ 1,00)
      </p>
      {pedido?.pontosUsados ? (
        <div className="desconto-aplicado">
          <p className="desconto">
            {pedido.pontosUsados.toLocaleString('pt-BR')} pontos usados neste pedido
          </p>
          <BotaoTouch
            variante="perigo"
            onClick={() => alterarDesconto(() => usarPontos(pedidoId, 0), setErro)}
          >
            Remover
          </BotaoTouch>
        </div>
      ) : (
        <div ref={campoRef}>
          <div className="cupom">
            <input
              readOnly
              value={pontos}
              onClick={() => setTecladoAberto(true)}
              onFocus={() => setTecladoAberto(true)}
              placeholder="Quantos pontos usar"
              aria-label="Quantos pontos usar"
            />
            {pontos && (
              <BotaoTouch variante="perigo" onClick={() => setPontos('')}>
                Limpar
              </BotaoTouch>
            )}
            <BotaoTouch variante="destaque" onClick={aplicar} disabled={!Number(pontos)}>
              Usar pontos
            </BotaoTouch>
          </div>
          {tecladoAberto && (
            <TecladoNumerico valor={pontos} onChange={setPontos} tamanhoMaximo={9} />
          )}
        </div>
      )}
      {erro && <p className="erro">{erro}</p>}
    </section>
  );
}
