import { useState } from 'react';
import type { CanalComprovante } from '@totem/shared';
import { AvisoConsentimento } from '../../components/AvisoConsentimento';
import { NotaFiscalNaTela, useNotaFiscal } from '../../components/NotaFiscalNaTela';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import { TecladoVirtual } from '../../components/TecladoVirtual';
import {
  ErroApi,
  dispensarComprovante,
  enviarComprovante,
  registrarConsentimentos,
} from '../../services/apiClient';
import { useConfig, useTermoConsentimento } from '../../contexts/ConfigContext';
import { usePedido } from '../../contexts/PedidoContext';
import { BotaoTouch } from '../../components/BotaoTouch';
import { celularValido, emailValido, formatarCelular } from '../../utils/contato';
import { formatarCentavos } from '../../utils/formatarMoeda';

const NOME_CANAL: Record<CanalComprovante, string> = { email: 'e-mail', sms: 'SMS' };
const OUTRO_CANAL: Record<CanalComprovante, CanalComprovante> = { email: 'sms', sms: 'email' };

// Como a tela terminou: comprovante enviado, cliente dispensou, ou o envio falhou e o
// cliente seguiu só com o número do pedido.
type Conclusao = { tipo: 'enviado'; canal: CanalComprovante } | { tipo: 'sem_envio' | 'falhou' };

// Falha de entrega (provedor fora do ar ou conexão caiu no meio): dá para tentar de novo
// ou usar o outro canal. Contato inválido (400) não é falha de entrega: é para corrigir.
function falhaDeEntrega(err: unknown): boolean {
  return (
    err instanceof ErroApi &&
    (err.codigo === 'FALHA_ENVIO' || err.status === 0 || err.status === 504)
  );
}

// Tela 5 — Emissão de nota e comprovante.
// US 15: a NFC-e é autorizada assim que o pagamento é aprovado e aparece aqui com o QR
// Code, antes (e independentemente) do e-mail/SMS. Erro fiscal: o pedido segue concluído,
// com o número na tela, e a falha fica registrada para a loja reemitir.
// Comprovante digital (US 41 / US 42), um extra — a nota já está na tela:
// - e-mail e celular são conferidos aqui antes do envio (sintaxe do e-mail; DDD e nono
//   dígito do celular), e o erro aparece na hora, com o campo preservado para corrigir;
// - o SMS leva o link direto da nota;
// - se o envio falha: aviso, "tentar de novo" ou o outro canal; se os dois falham, o
//   cliente segue com o número do pedido na tela.
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
  // Depois de tocar em "Enviar", o contato é conferido a cada mudança.
  const [conferir, setConferir] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<CanalComprovante[]>([]);
  const [conclusao, setConclusao] = useState<Conclusao | null>(null);
  const { paginas } = useConfig().aparencia;
  const termo = useTermoConsentimento();
  const { pedidoId, pedido, reiniciarPedido } = usePedido();
  const notaFiscal = useNotaFiscal(
    pedidoId,
    pedido?.status === 'pago' || pedido?.status === 'finalizado',
  );

  const contatoValido = canal === 'email' ? emailValido(email.trim()) : celularValido(telefone);
  const erroContato =
    canal === 'email'
      ? 'E-mail inválido. Confira o endereço (ex.: nome@exemplo.com).'
      : 'Número inválido. Informe o DDD e o celular com 9 dígitos (ex.: 11 98765-4321).';
  // Celular completo e errado já avisa sem esperar o toque em "Enviar".
  const mostrarErroContato =
    aceitou && !contatoValido && (conferir || (canal === 'sms' && telefone.length === 11));

  // A decisão do cliente é registrada antes de o e-mail/telefone sair do totem.
  async function enviar(canalEnvio: CanalComprovante = canal) {
    setConferir(true);
    const valido = canalEnvio === 'email' ? emailValido(email.trim()) : celularValido(telefone);
    if (!valido) return;
    setEnviando(true);
    setErro(null);
    try {
      await registrarConsentimentos(pedidoId, termo.versao, { comprovante: true });
      await enviarComprovante(pedidoId, {
        canal: canalEnvio,
        email: canalEnvio === 'email' ? email.trim() : undefined,
        telefone: canalEnvio === 'sms' ? telefone : undefined,
      });
      setConclusao({ tipo: 'enviado', canal: canalEnvio });
    } catch (err) {
      if (falhaDeEntrega(err)) {
        setFalhas((atuais) => (atuais.includes(canalEnvio) ? atuais : [...atuais, canalEnvio]));
      }
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // `recusou`: o cliente não quis o comprovante (registra a recusa). Sem `recusou`, o
  // envio falhou e ele segue só com o número do pedido (o consentimento continua dado).
  async function concluirSemEnvio(recusou: boolean) {
    setEnviando(true);
    setErro(null);
    try {
      if (recusou) {
        await registrarConsentimentos(pedidoId, termo.versao, { comprovante: false });
      }
      await dispensarComprovante(pedidoId);
      setConclusao({ tipo: recusou ? 'sem_envio' : 'falhou' });
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  function mudarAceite(aceito: boolean) {
    setAceitou(aceito);
    // Sem o consentimento, o que já foi digitado não fica na tela.
    if (!aceito) {
      setEmail('');
      setTelefone('');
      setConferir(false);
    }
  }

  function trocarCanal(novo: CanalComprovante) {
    setCanal(novo);
    setConferir(false);
    setErro(null);
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

  if (conclusao) {
    return (
      <div className="tela">
        <div className="sucesso cartao">
          <div className="sucesso__icone" aria-hidden="true">
            🎉
          </div>
          <h1 className="tela__titulo">Pedido concluído!</h1>
          {numero}
          <p className="tela__subtitulo">
            {conclusao.tipo === 'enviado' &&
              `Comprovante enviado por ${NOME_CANAL[conclusao.canal]}.`}
            {conclusao.tipo === 'sem_envio' && 'Pedido concluído sem envio de comprovante.'}
            {conclusao.tipo === 'falhou' &&
              'Não conseguimos enviar o comprovante. Guarde o número do pedido acima: com ele, o balcão reenvia o comprovante quando você pedir.'}
          </p>
          {!!pedido?.pontosAcumulados && (
            <p className="pontos-acumulados">
              Você acumulou {pedido.pontosAcumulados.toLocaleString('pt-BR')} pontos de fidelidade.
            </p>
          )}
          <BotaoTouch variante="primario" onClick={reiniciarPedido}>
            Novo pedido
          </BotaoTouch>
        </div>
        {/* US 09: o CPF que saiu na nota aparece mascarado (a tela é pública). */}
        <NotaFiscalNaTela {...notaFiscal} />
      </div>
    );
  }

  const falhouNoCanal = falhas.includes(canal);
  const todosFalharam = falhas.includes('email') && falhas.includes('sms');
  const outro = OUTRO_CANAL[canal];
  const contatoDoOutroPronto =
    outro === 'email' ? emailValido(email.trim()) : celularValido(telefone);
  const podeEnviar = aceitou && (canal === 'email' ? email.trim() !== '' : telefone !== '');

  return (
    <div className="tela">
      <h1 className="tela__titulo">{paginas.comprovante.titulo}</h1>
      {numero}
      <NotaFiscalNaTela {...notaFiscal} />
      <p className="tela__subtitulo">{paginas.comprovante.descricao}</p>

      <div className="segmento">
        <BotaoTouch onClick={() => trocarCanal('email')} disabled={canal === 'email'}>
          ✉️ E-mail
        </BotaoTouch>
        <BotaoTouch onClick={() => trocarCanal('sms')} disabled={canal === 'sms'}>
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
          <>
            <p className="valor-digitado" aria-label="E-mail digitado">
              {email || 'seuemail@exemplo.com'}
            </p>
            <TecladoVirtual
              valor={email}
              onChange={setEmail}
              tamanhoMaximo={80}
              email
              desabilitado={!aceitou}
            />
          </>
        ) : (
          <>
            <p className="valor-digitado" aria-label="Celular digitado">
              {formatarCelular(telefone) || '(DDD) 9xxxx-xxxx'}
            </p>
            <TecladoNumerico
              valor={telefone}
              onChange={setTelefone}
              tamanhoMaximo={11}
              desabilitado={!aceitou}
            />
          </>
        )}
        {mostrarErroContato && (
          <p className="erro" role="alert">
            {erroContato}
          </p>
        )}
        {aceitou && contatoValido && !falhouNoCanal && (
          <p className="aviso-cadastro aviso-cadastro--ok">
            {canal === 'email'
              ? 'E-mail conferido.'
              : 'Celular conferido. O SMS leva o link da nota.'}
          </p>
        )}
      </section>

      {falhouNoCanal ? (
        <section className="cartao" role="alert">
          <h2>⚠️ O comprovante não foi enviado</h2>
          <p className="erro">{erro}</p>
          {todosFalharam ? (
            <p>
              Também não deu certo pelo outro canal. Você pode seguir: o número do pedido fica na
              tela e a nota fiscal já está acima.
            </p>
          ) : (
            <p>Tente de novo, use o {NOME_CANAL[outro]} ou siga sem o comprovante.</p>
          )}
          <div className="tela__acoes">
            <BotaoTouch onClick={() => enviar()} disabled={enviando}>
              Tentar de novo
            </BotaoTouch>
            {!todosFalharam && (
              <BotaoTouch
                onClick={() =>
                  contatoDoOutroPronto ? (trocarCanal(outro), enviar(outro)) : trocarCanal(outro)
                }
                disabled={enviando}
              >
                Enviar por {NOME_CANAL[outro]}
              </BotaoTouch>
            )}
            <BotaoTouch
              variante="primario"
              onClick={() => concluirSemEnvio(false)}
              disabled={enviando}
            >
              Seguir com o número do pedido
            </BotaoTouch>
          </div>
        </section>
      ) : (
        <>
          {erro && (
            <p className="erro" role="alert">
              {erro}
            </p>
          )}
          <div className="tela__acoes">
            <BotaoTouch onClick={() => concluirSemEnvio(true)} disabled={enviando}>
              Concluir sem comprovante
            </BotaoTouch>
            <BotaoTouch
              variante="primario"
              onClick={() => enviar()}
              disabled={enviando || !podeEnviar}
            >
              {enviando ? 'Enviando...' : 'Enviar comprovante'}
            </BotaoTouch>
          </div>
        </>
      )}
    </div>
  );
}
