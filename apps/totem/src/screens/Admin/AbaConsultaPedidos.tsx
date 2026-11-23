import { useCallback, useEffect, useState } from 'react';
import type {
  CanalComprovante,
  FiltroConsultaPedidos,
  FormaPagamento,
  PedidoConsulta,
  StatusNotaConsulta,
  StatusPedido,
} from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { FORMAS_PAGAMENTO, nomeFormaPagamento } from '../../utils/formasPagamento';
import { formatarCentavos } from '../../utils/formatarMoeda';
import { Campo, MensagemRetorno, useAcao, type PropsAbaFuncionario } from './comum';

const NOME_STATUS_NOTA: Record<StatusNotaConsulta, string> = {
  autorizada: 'Nota autorizada',
  falha: 'Falha na nota',
  pendente: 'Nota pendente',
  nao_emitida: 'Sem nota',
};

// Reaproveita as cores das situações de cupom: verde, vermelho e amarelo.
const CLASSE_STATUS_NOTA: Record<StatusNotaConsulta, string> = {
  autorizada: 'valido',
  falha: 'inativo',
  pendente: 'nao_vigente',
  nao_emitida: 'esgotado',
};

const NOME_STATUS_PEDIDO: Record<StatusPedido, string> = {
  em_montagem: 'No carrinho',
  aguardando_pagamento: 'Aguardando o caixa',
  aguardando_pix: 'Pix na tela',
  pago: 'Pago',
  finalizado: 'Concluído',
  cancelado: 'Cancelado',
};

const NOME_CANAL: Record<CanalComprovante, string> = { email: 'E-mail', sms: 'SMS' };

function hojeNaLoja(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Chave de acesso em blocos de 4 dígitos, como impressa no DANFE.
function chaveEmBlocos(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, '$1 ');
}

// Consulta de pedidos (modo Funcionário; o Administrador também usa, ao alternar o modo).
// Filtra por período, situação da nota fiscal e forma de pagamento. Reenvia o comprovante
// a pedido do cliente e tenta de novo a NFC-e que falhou.
// LGPD: CPF e contatos chegam do servidor já mascarados; a tela nunca vê o dado completo.
export function AbaConsultaPedidos({ api }: PropsAbaFuncionario) {
  const [filtro, setFiltro] = useState<FiltroConsultaPedidos>(() => ({
    de: hojeNaLoja(),
    ate: hojeNaLoja(),
  }));
  const [pedidos, setPedidos] = useState<PedidoConsulta[] | null>(null);
  const [reenvio, setReenvio] = useState<PedidoConsulta | null>(null);
  const { retorno, ocupado, executar } = useAcao();

  const carregar = useCallback(
    () => executar(async () => setPedidos(await api.consultarPedidos(filtro))),
    [api, executar, filtro],
  );
  useEffect(() => {
    carregar();
  }, [carregar]);

  const alterarFiltro = (parcial: Partial<FiltroConsultaPedidos>) =>
    setFiltro((atual) => ({ ...atual, ...parcial }));

  const reemitir = (pedido: PedidoConsulta) =>
    executar(async () => {
      const comprovante = await api.reemitirNota(pedido.id);
      setPedidos(await api.consultarPedidos(filtro));
      if (comprovante.nota?.status !== 'autorizada') {
        throw new Error(
          `A nota do pedido ${pedido.numero} falhou de novo: ${comprovante.nota?.erro}`,
        );
      }
    }, `Nota do pedido ${pedido.numero} autorizada.`);

  return (
    <section className="admin-secao">
      <h2>Consulta de pedidos</h2>
      <p className="admin-dica">
        Pedidos que chegaram ao pagamento. CPF e contatos aparecem mascarados (LGPD).
      </p>

      <div className="relatorio-filtros" role="group" aria-label="Filtros da consulta">
        <label className="admin-campo">
          <span className="admin-campo__rotulo">De</span>
          <input
            type="date"
            value={filtro.de ?? ''}
            max={filtro.ate}
            onChange={(evento) => alterarFiltro({ de: evento.target.value || undefined })}
          />
        </label>
        <label className="admin-campo">
          <span className="admin-campo__rotulo">Até</span>
          <input
            type="date"
            value={filtro.ate ?? ''}
            min={filtro.de}
            onChange={(evento) => alterarFiltro({ ate: evento.target.value || undefined })}
          />
        </label>
        <label className="admin-campo">
          <span className="admin-campo__rotulo">Nota fiscal</span>
          <select
            value={filtro.statusNota ?? ''}
            onChange={(evento) =>
              alterarFiltro({
                statusNota: (evento.target.value || undefined) as StatusNotaConsulta | undefined,
              })
            }
          >
            <option value="">Todas</option>
            {(Object.keys(NOME_STATUS_NOTA) as StatusNotaConsulta[]).map((status) => (
              <option key={status} value={status}>
                {NOME_STATUS_NOTA[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-campo">
          <span className="admin-campo__rotulo">Pagamento</span>
          <select
            value={filtro.formaPagamento ?? ''}
            onChange={(evento) =>
              alterarFiltro({
                formaPagamento: (evento.target.value || undefined) as FormaPagamento | undefined,
              })
            }
          >
            <option value="">Todos</option>
            {FORMAS_PAGAMENTO.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        </label>
        <BotaoTouch onClick={carregar} disabled={ocupado}>
          Atualizar
        </BotaoTouch>
      </div>

      <MensagemRetorno retorno={retorno} />

      <div className="admin-lista">
        {pedidos?.map((pedido) => (
          <div key={pedido.id} className="admin-linha admin-linha--consulta">
            <strong className="admin-numero">{pedido.numero ?? '—'}</strong>
            <div className="admin-consulta__dados">
              <span>
                {pedido.itens.map((item) => `${item.quantidade}× ${item.nome}`).join(', ')}
              </span>
              <small>
                {[
                  dataHora(pedido.pagoEm ?? pedido.criadoEm),
                  formatarCentavos(pedido.valorAPagarCentavos),
                  pedido.formaPagamento && nomeFormaPagamento(pedido.formaPagamento),
                  NOME_STATUS_PEDIDO[pedido.status],
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
              {pedido.conciliadoComAtraso && (
                <small>
                  Pix confirmado depois de o QR expirar (conciliado, sem nova cobrança).
                </small>
              )}
              {pedido.notaNumero && (
                <small>
                  NFC-e nº {pedido.notaNumero}
                  {pedido.notaChaveAcesso && ` · chave ${chaveEmBlocos(pedido.notaChaveAcesso)}`}
                  {pedido.notaUrlConsulta && (
                    <>
                      {' · '}
                      <a href={pedido.notaUrlConsulta} target="_blank" rel="noreferrer">
                        consultar
                      </a>
                    </>
                  )}
                </small>
              )}
              {pedido.notaErro && <small className="erro">Motivo: {pedido.notaErro}</small>}
              {pedido.comprovanteFalha && (
                <small className="erro">Comprovante: {pedido.comprovanteFalha}</small>
              )}
              {pedido.cpfNaNotaMascarado && <small>CPF na nota: {pedido.cpfNaNotaMascarado}</small>}
              {pedido.comprovanteCanal && (
                <small>
                  Comprovante por {NOME_CANAL[pedido.comprovanteCanal]}:{' '}
                  {pedido.comprovanteContatoMascarado}
                  {pedido.comprovanteEnviadoEm && ` (${dataHora(pedido.comprovanteEnviadoEm)})`}
                </small>
              )}
            </div>
            <span
              className={`admin-situacao admin-situacao--${CLASSE_STATUS_NOTA[pedido.statusNota]}`}
            >
              {NOME_STATUS_NOTA[pedido.statusNota]}
            </span>
            {(pedido.status === 'pago' || pedido.status === 'finalizado') && (
              <div className="admin-linha__acoes">
                {pedido.statusNota === 'falha' && (
                  <BotaoTouch
                    variante="primario"
                    onClick={() => reemitir(pedido)}
                    disabled={ocupado}
                  >
                    Emitir nota de novo
                  </BotaoTouch>
                )}
                <BotaoTouch onClick={() => setReenvio(pedido)} disabled={ocupado}>
                  Reenviar comprovante
                </BotaoTouch>
              </div>
            )}
            {reenvio?.id === pedido.id && (
              <FormReenvio
                pedido={pedido}
                api={api}
                aoFechar={() => setReenvio(null)}
                aoEnviar={async () => {
                  setReenvio(null);
                  await carregar();
                }}
              />
            )}
          </div>
        ))}
        {pedidos?.length === 0 && <p className="admin-dica">Nenhum pedido com esses filtros.</p>}
      </div>
    </section>
  );
}

// Reenvio a pedido do cliente: para o mesmo contato (mascarado) ou para um contato novo
// que ele informa no balcão, com a autorização dele registrada.
function FormReenvio({
  pedido,
  api,
  aoFechar,
  aoEnviar,
}: {
  pedido: PedidoConsulta;
  api: PropsAbaFuncionario['api'];
  aoFechar: () => void;
  aoEnviar: () => Promise<void>;
}) {
  const temOriginal = pedido.comprovanteCanal !== undefined;
  const [destino, setDestino] = useState<'original' | 'novo'>(temOriginal ? 'original' : 'novo');
  const [canal, setCanal] = useState<CanalComprovante>('email');
  const [contato, setContato] = useState('');
  const [autorizado, setAutorizado] = useState(false);
  const { retorno, ocupado, executar } = useAcao();

  const enviar = () =>
    executar(async () => {
      const resposta = await api.reenviarComprovante(
        pedido.id,
        destino === 'original'
          ? { contatoOriginal: true }
          : {
              canal,
              email: canal === 'email' ? contato : undefined,
              telefone: canal === 'sms' ? contato : undefined,
              autorizadoPeloCliente: autorizado,
            },
      );
      window.alert(
        `Comprovante do pedido ${pedido.numero} reenviado por ${NOME_CANAL[resposta.canal]} para ${resposta.contatoMascarado}.`,
      );
      await aoEnviar();
    });

  const pronto = destino === 'original' || (contato.trim() !== '' && autorizado);

  return (
    <form
      className="admin-linha__inteira admin-reenvio"
      onSubmit={(evento) => {
        evento.preventDefault();
        enviar();
      }}
    >
      <fieldset className="admin-escolha">
        <legend className="admin-campo__rotulo">Reenviar para</legend>
        {temOriginal && (
          <label className="admin-opcao">
            <input
              type="radio"
              name={`destino-${pedido.id}`}
              checked={destino === 'original'}
              onChange={() => setDestino('original')}
            />
            <span>
              <strong>O mesmo contato</strong>
              <small>
                {NOME_CANAL[pedido.comprovanteCanal as CanalComprovante]}:{' '}
                {pedido.comprovanteContatoMascarado}
              </small>
            </span>
          </label>
        )}
        <label className="admin-opcao">
          <input
            type="radio"
            name={`destino-${pedido.id}`}
            checked={destino === 'novo'}
            onChange={() => setDestino('novo')}
          />
          <span>
            <strong>Um contato novo, informado pelo cliente</strong>
          </span>
        </label>
      </fieldset>

      {destino === 'novo' && (
        <>
          <div className="admin-grade">
            <Campo rotulo="Canal">
              <select
                value={canal}
                onChange={(evento) => setCanal(evento.target.value as CanalComprovante)}
              >
                <option value="email">E-mail</option>
                <option value="sms">SMS</option>
              </select>
            </Campo>
            <Campo rotulo={canal === 'email' ? 'E-mail' : 'Celular com DDD'}>
              <input
                type={canal === 'email' ? 'email' : 'tel'}
                autoComplete="off"
                value={contato}
                onChange={(evento) => setContato(evento.target.value)}
              />
            </Campo>
          </div>
          <label className="admin-opcao">
            <input
              type="checkbox"
              checked={autorizado}
              onChange={(evento) => setAutorizado(evento.target.checked)}
            />
            <span>
              <strong>O cliente pediu o reenvio e autorizou o uso deste contato</strong>
              <small>A autorização fica registrada na auditoria do consentimento (LGPD).</small>
            </span>
          </label>
        </>
      )}

      <MensagemRetorno retorno={retorno} />
      <div className="admin-linha__acoes">
        <BotaoTouch type="submit" variante="primario" disabled={!pronto || ocupado}>
          Reenviar
        </BotaoTouch>
        <BotaoTouch onClick={aoFechar}>Cancelar</BotaoTouch>
      </div>
    </form>
  );
}
