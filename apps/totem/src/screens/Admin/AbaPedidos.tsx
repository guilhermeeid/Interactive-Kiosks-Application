import { useCallback, useEffect, useState } from 'react';
import type { PedidoAguardandoRetirada } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { formatarCentavos } from '../../utils/formatarMoeda';
import { MensagemRetorno, useAcao, type PropsAba } from './comum';

const INTERVALO_ATUALIZACAO_MS = 15000;

// Pedidos pagos que aguardam a retirada. O "ok" do balcão confirma a entrega e libera
// o número de três dígitos do pedido para ser sorteado de novo.
export function AbaPedidos({ api }: PropsAba) {
  const [pedidos, setPedidos] = useState<PedidoAguardandoRetirada[]>([]);
  const { retorno, ocupado, executar } = useAcao();

  const carregar = useCallback(
    () => executar(async () => setPedidos(await api.listarPedidos())),
    [api, executar],
  );
  useEffect(() => {
    carregar();
    const intervalo = window.setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
    return () => window.clearInterval(intervalo);
  }, [carregar]);

  const confirmar = (pedido: PedidoAguardandoRetirada) =>
    executar(async () => {
      await api.confirmarEntrega(pedido.id);
      setPedidos(await api.listarPedidos());
    }, `Pedido ${pedido.numero} entregue. O número voltou a ficar livre.`);

  return (
    <section className="admin-secao">
      <h2>Pedidos aguardando retirada</h2>
      <p className="admin-dica">
        O número de cada pedido não se repete enquanto ele estiver nesta lista.
      </p>
      <MensagemRetorno retorno={retorno} />

      <div className="admin-lista">
        {pedidos.map((pedido) => (
          <div key={pedido.id} className="admin-linha admin-linha--pedido">
            <strong className="admin-numero">{pedido.numero}</strong>
            <div>
              <span>
                {pedido.itens.map((item) => `${item.quantidade}× ${item.nome}`).join(', ')}
              </span>
              <small>{formatarCentavos(pedido.valorAPagarCentavos)}</small>
            </div>
            <BotaoTouch variante="primario" onClick={() => confirmar(pedido)} disabled={ocupado}>
              OK, entregue
            </BotaoTouch>
          </div>
        ))}
        {pedidos.length === 0 && <p className="admin-dica">Nenhum pedido aguardando.</p>}
      </div>

      <BotaoTouch onClick={carregar}>Atualizar</BotaoTouch>
    </section>
  );
}
