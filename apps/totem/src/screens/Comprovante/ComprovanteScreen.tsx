import { useState } from 'react';
import type { CanalComprovante, Comprovante } from '@totem/shared';
import { AvisoConsentimento } from '../../components/AvisoConsentimento';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import {
  dispensarComprovante,
  enviarComprovante,
  registrarConsentimentos,
} from '../../services/apiClient';
import { useConfig, useTermoConsentimento } from '../../contexts/ConfigContext';
import { usePedido } from '../../contexts/PedidoContext';
import { BotaoTouch } from '../../components/BotaoTouch';
import { formatarCentavos } from '../../utils/formatarMoeda';

const NOME_CANAL: Record<CanalComprovante, string> = { email: 'e-mail', sms: 'SMS' };

// Tela 5 — Emissão de nota e comprovante.
// US-08: Receber comprovante por e-mail/SMS.
// US 29: e-mail e telefone só podem ser digitados depois que o cliente concorda com o
// uso; recusar conclui o pedido do mesmo jeito, sem guardar nada.
// Item 2: pedido em dinheiro não tem nota nem comprovante aqui — o cliente paga no
// caixa, onde a nota é emitida e impressa.
// LGPD: dado pessoal — exige consentimento/criptografia (e-mail/telefone digitados
// nesta tela).
export function ComprovanteScreen() {
  const [canal, setCanal] = useState<CanalComprovante>('email');
  const [aceitou, setAceitou] = useState(false);
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [comprovante, setComprovante] = useState<Comprovante | null>(null);
  const { paginas } = useConfig().aparencia;
  const termo = useTermoConsentimento();
  const { pedidoId, pedido, reiniciarPedido } = usePedido();

  async function concluir(acao: () => Promise<Comprovante>) {
    setEnviando(true);
    setErro(null);
    try {
      setComprovante(await acao());
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // A decisão do cliente é registrada antes de o e-mail/telefone sair do totem.
  const enviar = () =>
    concluir(async () => {
      await registrarConsentimentos(pedidoId, termo.versao, { comprovante: true });
      return enviarComprovante(pedidoId, {
        canal,
        email: canal === 'email' ? email : undefined,
        telefone: canal === 'sms' ? telefone : undefined,
      });
    });

  const concluirSemComprovante = () =>
    concluir(async () => {
      await registrarConsentimentos(pedidoId, termo.versao, { comprovante: false });
      return dispensarComprovante(pedidoId);
    });

  function mudarAceite(aceito: boolean) {
    setAceitou(aceito);
    // Sem o consentimento, o que já foi digitado não fica na tela.
    if (!aceito) {
      setEmail('');
      setTelefone('');
    }
  }

  // Número que o cliente acompanha até a retirada, na mesma hierarquia do título; fica
  // reservado até o balcão confirmar a entrega.
  const numero = pedido?.numero && (
    <p className="tela__titulo numero-pedido" aria-label={`Pedido número ${pedido.numero}`}>
      Nº {pedido.numero}
    </p>
  );

  if (pedido?.status === 'aguardando_pagamento') {
    return (
      <div className="tela">
        <div className="sucesso cartao">
          <div className="sucesso__icone" aria-hidden="true">
            💵
          </div>
          <h1 className="tela__titulo">Pague no caixa</h1>
          {numero}
          <p className="tela__subtitulo">
            Dirija-se ao caixa e informe o número do pedido para pagar{' '}
            <strong>{formatarCentavos(pedido.valorAPagarCentavos)}</strong> em dinheiro.
          </p>
          <p className="nota">A nota fiscal será emitida e impressa no caixa.</p>
          {!!pedido.pontosPrevistos && (
            <p className="pontos-acumulados">
              Ao pagar, você acumula {pedido.pontosPrevistos.toLocaleString('pt-BR')} pontos de
              fidelidade.
            </p>
          )}
          <BotaoTouch variante="primario" onClick={reiniciarPedido}>
            Novo pedido
          </BotaoTouch>
        </div>
      </div>
    );
  }

  if (comprovante) {
    return (
      <div className="tela">
        <div className="sucesso cartao">
          <div className="sucesso__icone" aria-hidden="true">
            🎉
          </div>
          <h1 className="tela__titulo">Pedido concluído!</h1>
          {numero}
          <p className="tela__subtitulo">
            {comprovante.destino
              ? `Comprovante enviado por ${NOME_CANAL[comprovante.destino.canal]}.`
              : 'Pedido concluído sem envio de comprovante.'}
          </p>
          {!!pedido?.pontosAcumulados && (
            <p className="pontos-acumulados">
              Você acumulou {pedido.pontosAcumulados.toLocaleString('pt-BR')} pontos de fidelidade.
            </p>
          )}
          {/* US 09: confirma ao cliente que o CPF saiu na nota (mascarado: a tela é pública). */}
          {comprovante.cpfNaNotaMascarado && (
            <p className="nota">CPF na nota fiscal: {comprovante.cpfNaNotaMascarado}</p>
          )}
          {comprovante.notaFiscalUrl && (
            <p className="nota">Nota fiscal: {comprovante.notaFiscalUrl}</p>
          )}
          <BotaoTouch variante="primario" onClick={reiniciarPedido}>
            Novo pedido
          </BotaoTouch>
        </div>
      </div>
    );
  }

  const podeEnviar = aceitou && (canal === 'email' ? email.length > 0 : telefone.length > 0);

  return (
    <div className="tela">
      <h1 className="tela__titulo">{paginas.comprovante.titulo}</h1>
      <p className="tela__subtitulo">{paginas.comprovante.descricao}</p>

      <div className="segmento">
        <BotaoTouch onClick={() => setCanal('email')} disabled={canal === 'email'}>
          ✉️ E-mail
        </BotaoTouch>
        <BotaoTouch onClick={() => setCanal('sms')} disabled={canal === 'sms'}>
          📱 SMS
        </BotaoTouch>
      </div>

      <section className="cartao">
        <AvisoConsentimento
          termo={termo}
          finalidades={['comprovante']}
          aceites={{ comprovante: aceitou }}
          aoMudar={(_finalidade, aceito) => mudarAceite(aceito)}
        />
        {canal === 'email' ? (
          <input
            type="email"
            value={email}
            disabled={!aceitou}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seuemail@exemplo.com"
          />
        ) : (
          <>
            <p className="valor-digitado">{telefone || '—'}</p>
            <TecladoNumerico
              valor={telefone}
              onChange={setTelefone}
              tamanhoMaximo={11}
              desabilitado={!aceitou}
            />
          </>
        )}
      </section>

      {erro && <p className="erro">{erro}</p>}

      <div className="tela__acoes">
        <BotaoTouch onClick={concluirSemComprovante} disabled={enviando}>
          Concluir sem comprovante
        </BotaoTouch>
        <BotaoTouch variante="primario" onClick={enviar} disabled={enviando || !podeEnviar}>
          Enviar comprovante
        </BotaoTouch>
      </div>
    </div>
  );
}
