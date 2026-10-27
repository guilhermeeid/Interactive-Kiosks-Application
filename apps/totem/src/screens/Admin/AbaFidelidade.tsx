import { useCallback, useEffect, useState } from 'react';
import type { ClienteFidelidade, ConfigFidelidade } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { CodigoQr } from '../../components/CodigoQr';
import { Modal } from '../../components/Modal';
import { formatarCpf } from '../../utils/cpf';
import { formatarCentavos } from '../../utils/formatarMoeda';
import { qrDeFidelidade } from '../../utils/qr';
import { Campo, MensagemRetorno, Opcao, SALVO_PENDENTE, useAcao, type PropsAba } from './comum';

// Pedido usado para ilustrar as regras de acúmulo enquanto o administrador as ajusta.
const PEDIDO_EXEMPLO_CENTAVOS = 5000;

export function AbaFidelidade(props: PropsAba) {
  return (
    <>
      <SecaoRegras {...props} />
      <SecaoClientes {...props} />
    </>
  );
}

// ---------- Regras do programa ----------

function SecaoRegras({ config, salvarConfig }: PropsAba) {
  const [regras, setRegras] = useState<ConfigFidelidade>(config.fidelidade);
  // Os números ficam como texto enquanto são digitados, para o campo poder ficar vazio.
  const [percentual, setPercentual] = useState(String(config.fidelidade.percentualAcumulo));
  const [pontosPorReal, setPontosPorReal] = useState(String(config.fidelidade.pontosPorReal));
  const { retorno, ocupado, executar } = useAcao();

  const alterar = (parcial: Partial<ConfigFidelidade>) =>
    setRegras((atuais) => ({ ...atuais, ...parcial }));

  const percentualNumero = Number(percentual.replace(',', '.'));
  const pontosPorRealNumero = Number(pontosPorReal);

  const salvar = () =>
    executar(
      () =>
        salvarConfig({
          ...config,
          fidelidade: {
            ...regras,
            percentualAcumulo: percentualNumero,
            pontosPorReal: pontosPorRealNumero,
          },
        }),
      SALVO_PENDENTE,
    );

  // Mesma conta que a API faz no pagamento, só para o administrador ver o efeito.
  const pontosDoExemplo = Math.floor(
    (PEDIDO_EXEMPLO_CENTAVOS * percentualNumero * pontosPorRealNumero) / 10000,
  );
  const exemploValido =
    Number.isFinite(pontosDoExemplo) && pontosPorRealNumero >= 1 && percentualNumero >= 0;

  return (
    <form
      className="admin-secao"
      onSubmit={(evento) => {
        evento.preventDefault();
        salvar();
      }}
    >
      <h2>Programa de fidelidade</h2>
      <Opcao
        rotulo="Programa de fidelidade habilitado"
        dica="Desligado, o totem não consulta saldo, não oferece o uso de pontos e não acumula pontos. O CPF continua valendo para a nota."
        marcado={regras.habilitado}
        aoMudar={(habilitado) => alterar({ habilitado })}
      />

      {regras.habilitado && (
        <>
          <Campo
            rotulo="Quantos pontos valem R$ 1,00"
            dica="Equivalência usada quando o cliente troca pontos por desconto."
          >
            <input
              type="text"
              inputMode="numeric"
              value={pontosPorReal}
              onChange={(evento) => setPontosPorReal(evento.target.value)}
            />
          </Campo>

          <Opcao
            rotulo="Clientes acumulam pontos a cada pedido"
            dica="Só acumula quem informa um CPF cadastrado na fidelidade."
            marcado={regras.acumuloHabilitado}
            aoMudar={(acumuloHabilitado) => alterar({ acumuloHabilitado })}
          />
          {regras.acumuloHabilitado && (
            <Campo
              rotulo="Percentual do valor pago que volta em pontos (%)"
              dica={
                exemploValido
                  ? `Exemplo: um pedido de ${formatarCentavos(PEDIDO_EXEMPLO_CENTAVOS)} rende ${pontosDoExemplo.toLocaleString('pt-BR')} pontos, que valem ${formatarCentavos(Math.floor((pontosDoExemplo * 100) / pontosPorRealNumero))}.`
                  : undefined
              }
            >
              <input
                type="text"
                inputMode="decimal"
                value={percentual}
                onChange={(evento) => setPercentual(evento.target.value)}
              />
            </Campo>
          )}

          <Opcao
            rotulo="Pontos podem ser somados a cupons"
            dica="Desmarcado, um pedido com cupom não pode usar pontos nem acumula pontos."
            marcado={regras.combinaComCupom}
            aoMudar={(combinaComCupom) => alterar({ combinaComCupom })}
          />
        </>
      )}

      <MensagemRetorno retorno={retorno} />
      <BotaoTouch type="submit" variante="primario" disabled={ocupado}>
        Salvar fidelidade
      </BotaoTouch>
    </form>
  );
}

// ---------- Clientes cadastrados ----------
// LGPD: dado pessoal — exige consentimento/criptografia (CPF dos clientes)

function SecaoClientes({ api }: PropsAba) {
  const [clientes, setClientes] = useState<ClienteFidelidade[]>([]);
  const [cpf, setCpf] = useState('');
  const [pontosIniciais, setPontosIniciais] = useState('0');
  // Pontos em edição, por id do cliente, até o administrador tocar em "Salvar".
  const [pontosEditados, setPontosEditados] = useState<Record<string, string>>({});
  // Cartão de fidelidade em QR (leva o id do cadastro, nunca o CPF) aberto na tela.
  const [cartao, setCartao] = useState<ClienteFidelidade | null>(null);
  const { retorno, ocupado, executar } = useAcao();

  const carregar = useCallback(
    () => executar(async () => setClientes(await api.listarClientes())),
    [api, executar],
  );
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function cadastrar() {
    const cadastrou = await executar(async () => {
      await api.cadastrarCliente(cpf, Number(pontosIniciais));
      setClientes(await api.listarClientes());
    }, 'Cliente cadastrado.');
    if (cadastrou) {
      setCpf('');
      setPontosIniciais('0');
    }
  }

  const salvarPontos = (cliente: ClienteFidelidade) =>
    executar(async () => {
      await api.atualizarPontosCliente(cliente.id, Number(pontosEditados[cliente.id]));
      setClientes(await api.listarClientes());
      setPontosEditados(({ [cliente.id]: _salvo, ...demais }) => demais);
    }, 'Pontos atualizados.');

  const remover = (cliente: ClienteFidelidade) =>
    window.confirm(`Remover ${formatarCpf(cliente.numeroFidelidade)} da fidelidade?`) &&
    executar(async () => {
      await api.removerCliente(cliente.id);
      setClientes(await api.listarClientes());
    }, 'Cliente removido.');

  return (
    <section className="admin-secao">
      <h2>Clientes cadastrados</h2>
      <p className="admin-dica">
        O totem não cadastra ninguém: um CPF que não está nesta lista é avisado de que não tem
        cadastro e segue sem fidelidade.
      </p>

      <form
        className="admin-linha admin-linha--cliente"
        onSubmit={(evento) => {
          evento.preventDefault();
          cadastrar();
        }}
      >
        <Campo rotulo="CPF">
          <input
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={formatarCpf(cpf)}
            onChange={(evento) => setCpf(evento.target.value.replace(/\D/g, '').slice(0, 11))}
          />
        </Campo>
        <Campo rotulo="Pontos iniciais">
          <input
            type="text"
            inputMode="numeric"
            value={pontosIniciais}
            onChange={(evento) => setPontosIniciais(evento.target.value.replace(/\D/g, ''))}
          />
        </Campo>
        <BotaoTouch type="submit" variante="primario" disabled={ocupado || cpf.length !== 11}>
          Cadastrar
        </BotaoTouch>
      </form>

      <MensagemRetorno retorno={retorno} />

      <div className="admin-lista">
        {clientes.map((cliente) => {
          const editado = pontosEditados[cliente.id];
          return (
            <div key={cliente.id} className="admin-linha admin-linha--cliente">
              <strong>{formatarCpf(cliente.numeroFidelidade)}</strong>
              <Campo rotulo="Pontos">
                <input
                  type="text"
                  inputMode="numeric"
                  value={editado ?? String(cliente.pontos)}
                  onChange={(evento) =>
                    setPontosEditados((atuais) => ({
                      ...atuais,
                      [cliente.id]: evento.target.value.replace(/\D/g, ''),
                    }))
                  }
                />
              </Campo>
              <div className="admin-linha__acoes">
                <BotaoTouch
                  onClick={() => salvarPontos(cliente)}
                  disabled={ocupado || !editado || editado === String(cliente.pontos)}
                >
                  Salvar
                </BotaoTouch>
                <BotaoTouch onClick={() => setCartao(cliente)}>Cartão (QR)</BotaoTouch>
                <BotaoTouch variante="perigo" onClick={() => remover(cliente)}>
                  Remover
                </BotaoTouch>
              </div>
            </div>
          );
        })}
        {clientes.length === 0 && <p className="admin-dica">Nenhum cliente cadastrado.</p>}
      </div>

      {cartao && (
        <Modal titulo="Cartão de fidelidade" aoFechar={() => setCartao(null)}>
          <p>
            Imprima ou envie ao cliente. Na câmera do totem, este QR identifica o cadastro{' '}
            <strong>{formatarCpf(cartao.numeroFidelidade)}</strong> sem digitar o CPF (o QR não
            contém o CPF).
          </p>
          <CodigoQr texto={qrDeFidelidade(cartao.id)} rotulo="QR do cartão de fidelidade" />
        </Modal>
      )}
    </section>
  );
}
