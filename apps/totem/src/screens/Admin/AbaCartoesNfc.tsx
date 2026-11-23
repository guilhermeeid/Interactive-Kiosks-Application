import { useCallback, useEffect, useRef, useState } from 'react';
import type { CadastroNfcPendente, CartaoNfc, ComPendencia, ItemCardapio } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { estadoLeitorNfc } from '../../services/apiClient';
import { Campo, MensagemRetorno, useAcao, type PropsAba } from './comum';

type CartaoComItem = CartaoNfc & { nomeItem?: string };

const INTERVALO_ESTADO_MS = 3_000;
const INTERVALO_CADASTRO_MS = 1_000;

// Módulo NFC (opcional): um celular ligado ao notebook por USB-C lê cartões e o item
// deles entra no carrinho do totem. Modo híbrido:
// - cartão regravável: o código do item é gravado nele pela página do leitor (modo
//   "Gravar cartão"), sem passar por aqui;
// - cartão travado (ex.: de evento, não aceita gravação): cadastrado aqui pelo número de
//   série. Vale na hora.
export function AbaCartoesNfc({ api }: PropsAba) {
  const [leitorAtivo, setLeitorAtivo] = useState<boolean | null>(null);
  const [cartoes, setCartoes] = useState<CartaoComItem[]>([]);
  const [produtos, setProdutos] = useState<ComPendencia<ItemCardapio>[]>([]);
  const [itemEscolhido, setItemEscolhido] = useState('');
  const [cadastro, setCadastro] = useState<CadastroNfcPendente | null>(null);
  const { retorno, ocupado, executar } = useAcao();
  const { retorno: retornoCadastro, executar: executarCadastro } = useAcao();
  const aguardando = useRef(false);

  const carregarCartoes = useCallback(
    () => executar(async () => setCartoes(await api.listarCartoesNfc())),
    [api, executar],
  );

  useEffect(() => {
    carregarCartoes();
    executar(async () => {
      // Só itens já em vigor: um item novo pendente ainda não existe para o totem.
      const lista = (await api.listarProdutos()).filter((p) => p.pendente !== 'novo');
      setProdutos(lista);
      setItemEscolhido((atual) => atual || lista[0]?.id || '');
    });
  }, [api, executar, carregarCartoes]);

  // Estado do leitor, para o Administrador saber se pode cadastrar.
  useEffect(() => {
    const conferir = () =>
      estadoLeitorNfc()
        .then(({ leitorAtivo }) => setLeitorAtivo(leitorAtivo))
        .catch(() => setLeitorAtivo(false));
    conferir();
    const intervalo = window.setInterval(conferir, INTERVALO_ESTADO_MS);
    return () => window.clearInterval(intervalo);
  }, []);

  // Esperando o cartão ser aproximado.
  useEffect(() => {
    if (!cadastro || cadastro.concluido) return;
    aguardando.current = true;
    const intervalo = window.setInterval(async () => {
      const atual = await api.obterCadastroNfc().catch(() => null);
      if (!aguardando.current) return;
      if (atual?.concluido) {
        aguardando.current = false;
        setCadastro(atual);
        carregarCartoes();
      } else if (!atual || Date.parse(atual.expiraEm) <= Date.now()) {
        aguardando.current = false;
        setCadastro(null);
        executarCadastro(async () => {
          throw new Error('Tempo esgotado: nenhum cartão foi aproximado. Tente de novo.');
        });
      }
    }, INTERVALO_CADASTRO_MS);
    return () => {
      aguardando.current = false;
      window.clearInterval(intervalo);
    };
  }, [api, cadastro, carregarCartoes, executarCadastro]);

  const nomeEscolhido = produtos.find((p) => p.id === itemEscolhido)?.nome ?? '';

  const iniciar = () =>
    executarCadastro(async () => setCadastro(await api.iniciarCadastroNfc(itemEscolhido)));

  const cancelar = () =>
    executarCadastro(async () => {
      await api.cancelarCadastroNfc();
      setCadastro(null);
    }, 'Cadastro cancelado.');

  const remover = (cartao: CartaoComItem) =>
    window.confirm(
      `Remover o cartão ${cartao.numeroSerie} (${cartao.nomeItem ?? 'item removido'})?`,
    ) &&
    executar(async () => {
      await api.removerCartaoNfc(cartao.numeroSerie);
      setCartoes(await api.listarCartoesNfc());
    }, 'Cartão removido.');

  return (
    <>
      <section className="admin-secao">
        <h2>Leitor NFC</h2>
        <p
          className={`admin-situacao admin-situacao--${leitorAtivo ? 'valido' : 'nao_vigente'}`}
          role="status"
        >
          {leitorAtivo === null
            ? 'Conferindo...'
            : leitorAtivo
              ? 'Leitor conectado'
              : 'Leitor desconectado'}
        </p>
        <p className="admin-dica">
          Ligue o celular ao notebook pelo cabo USB-C (depuração USB ativa), rode{' '}
          <code>adb reverse tcp:5173 tcp:5173</code> e <code>adb reverse tcp:3333 tcp:3333</code> e
          abra <code>http://localhost:5173/leitor-nfc</code> no Chrome do celular. Passo a passo no
          README, seção “Leitor NFC”.
        </p>
        <p className="admin-dica">
          <strong>Cartão regravável:</strong> grave o item pela própria página do leitor, no modo
          “Gravar cartão” — pode regravar quantas vezes quiser. <strong>Cartão travado</strong> (não
          aceita gravação, como os de evento): cadastre abaixo. O código gravado vale mais que o
          cadastro.
        </p>
      </section>

      <section className="admin-secao">
        <h2>Cadastrar cartão travado</h2>
        {cadastro && !cadastro.concluido ? (
          <>
            <p className="admin-aviso" role="status">
              Aproxime agora o cartão do leitor para ligá-lo a “{nomeEscolhido}” (até 60 segundos).
            </p>
            <BotaoTouch onClick={cancelar}>Cancelar</BotaoTouch>
          </>
        ) : (
          <>
            {cadastro?.concluido && (
              <p className="admin-ok" role="status">
                Cartão {cadastro.concluido.numeroSerie} cadastrado como “
                {produtos.find((p) => p.id === cadastro.concluido?.itemCardapioId)?.nome}”. Já vale
                no totem.
              </p>
            )}
            {cadastro?.aviso && <p className="admin-aviso">{cadastro.aviso}</p>}
            <div className="admin-grade">
              <Campo rotulo="Item do cartão">
                <select
                  value={itemEscolhido}
                  onChange={(evento) => setItemEscolhido(evento.target.value)}
                >
                  {produtos.map((produto) => (
                    <option key={produto.id} value={produto.id}>
                      {produto.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <BotaoTouch
              variante="primario"
              onClick={iniciar}
              disabled={!itemEscolhido || !leitorAtivo}
            >
              Cadastrar cartão
            </BotaoTouch>
          </>
        )}
        <MensagemRetorno retorno={retornoCadastro} />
      </section>

      <section className="admin-secao">
        <h2>Cartões cadastrados</h2>
        <MensagemRetorno retorno={retorno} />
        <div className="admin-lista">
          {cartoes.map((cartao) => (
            <div key={cartao.numeroSerie} className="admin-linha admin-linha--produto">
              <span className="admin-miniatura" aria-hidden="true">
                📶
              </span>
              <div>
                <strong>{cartao.nomeItem ?? 'Item que saiu do cardápio'}</strong>
                <br />
                <small>
                  {cartao.numeroSerie} · cadastrado em{' '}
                  {new Date(cartao.cadastradoEm).toLocaleString('pt-BR')}
                </small>
              </div>
              <BotaoTouch variante="perigo" onClick={() => remover(cartao)} disabled={ocupado}>
                Remover
              </BotaoTouch>
            </div>
          ))}
          {cartoes.length === 0 && <p className="admin-dica">Nenhum cartão cadastrado.</p>}
        </div>
      </section>
    </>
  );
}
