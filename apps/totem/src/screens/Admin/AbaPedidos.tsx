import { useCallback, useEffect, useState } from 'react';
import type { ConsumoPedido, PedidoAguardandoRetirada } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { mascararCpf } from '../../utils/cpf';
import { nomeFormaPagamento } from '../../utils/formasPagamento';
import { formatarCentavos } from '../../utils/formatarMoeda';
import { MensagemRetorno, useAcao, type PropsAbaFuncionario } from './comum';

const INTERVALO_ATUALIZACAO_MS = 15000;

const NOME_CONSUMO: Record<ConsumoPedido, string> = {
  local: 'Para comer aqui',
  viagem: 'Para levar',
};

function Resumo({ pedido }: { pedido: PedidoAguardandoRetirada }) {
  return (
    <div>
      <span>{pedido.itens.map((item) => `${item.quantidade}× ${item.nome}`).join(', ')}</span>
      <small>
        {[
          formatarCentavos(pedido.valorAPagarCentavos),
          pedido.formaPagamento && nomeFormaPagamento(pedido.formaPagamento),
          pedido.consumo && NOME_CONSUMO[pedido.consumo],
        ]
          .filter(Boolean)
          .join(' · ')}
      </small>
      {/* LGPD: o CPF sai na nota emitida pelo servidor; aqui só o miolo, para conferir. */}
      {pedido.cpfNaNota && <small>CPF na nota: {mascararCpf(pedido.cpfNaNota)}</small>}
      {pedido.notaFiscalUrl && (
        <small>
          <a href={pedido.notaFiscalUrl} target="_blank" rel="noreferrer">
            Nota fiscal
          </a>
        </small>
      )}
    </div>
  );
}

// Modo Funcionário: o caixa e o balcão.
// - Item 2: pedido em dinheiro chega aqui esperando pagamento. O caixa recebe (os pontos
//   entram e a nota é emitida para imprimir) ou cancela (estoque, cupom e pontos voltam).
// - O "ok" do balcão confirma a entrega e libera o número de três dígitos do pedido.
export function AbaPedidos({ api }: PropsAbaFuncionario) {
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

  const receber = (pedido: PedidoAguardandoRetirada) =>
    executar(async () => {
      await api.receberNoCaixa(pedido.id);
      setPedidos(await api.listarPedidos());
    }, `Pedido ${pedido.numero} pago. A nota fiscal foi emitida: imprima pelo link no balcão abaixo.`);

  const cancelar = (pedido: PedidoAguardandoRetirada) =>
    window.confirm(`Cancelar o pedido ${pedido.numero}? Estoque, cupom e pontos usados voltam.`) &&
    executar(async () => {
      await api.cancelarNoCaixa(pedido.id);
      setPedidos(await api.listarPedidos());
    }, `Pedido ${pedido.numero} cancelado.`);

  const entregar = (pedido: PedidoAguardandoRetirada) =>
    executar(async () => {
      await api.confirmarEntrega(pedido.id);
      setPedidos(await api.listarPedidos());
    }, `Pedido ${pedido.numero} entregue. O número voltou a ficar livre.`);

  const noCaixa = pedidos.filter((pedido) => pedido.status === 'aguardando_pagamento');
  const paraRetirar = pedidos.filter((pedido) => pedido.status !== 'aguardando_pagamento');

  return (
    <>
      <section className="admin-secao">
        <h2>Caixa: pagamento em dinheiro</h2>
        <p className="admin-dica">
          O cliente informa o número do pedido. Receba o valor e confirme: a nota fiscal sai para
          impressão.
        </p>
        <MensagemRetorno retorno={retorno} />

        <div className="admin-lista">
          {noCaixa.map((pedido) => (
            <div key={pedido.id} className="admin-linha admin-linha--pedido">
              <strong className="admin-numero">{pedido.numero}</strong>
              <Resumo pedido={pedido} />
              <div className="admin-linha__acoes">
                <BotaoTouch variante="primario" onClick={() => receber(pedido)} disabled={ocupado}>
                  Recebi {formatarCentavos(pedido.valorAPagarCentavos)}
                </BotaoTouch>
                <BotaoTouch variante="perigo" onClick={() => cancelar(pedido)} disabled={ocupado}>
                  Cancelar
                </BotaoTouch>
              </div>
            </div>
          ))}
          {noCaixa.length === 0 && <p className="admin-dica">Nenhum pedido esperando o caixa.</p>}
        </div>
      </section>

      <section className="admin-secao">
        <h2>Balcão: aguardando retirada</h2>
        <p className="admin-dica">
          O número de cada pedido não se repete enquanto ele estiver nesta lista.
        </p>

        <div className="admin-lista">
          {paraRetirar.map((pedido) => (
            <div key={pedido.id} className="admin-linha admin-linha--pedido">
              <strong className="admin-numero">{pedido.numero}</strong>
              <Resumo pedido={pedido} />
              <BotaoTouch variante="primario" onClick={() => entregar(pedido)} disabled={ocupado}>
                OK, entregue
              </BotaoTouch>
            </div>
          ))}
          {paraRetirar.length === 0 && <p className="admin-dica">Nenhum pedido aguardando.</p>}
        </div>

        <BotaoTouch onClick={carregar}>Atualizar</BotaoTouch>
      </section>
    </>
  );
}
