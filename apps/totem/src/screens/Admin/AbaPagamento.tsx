import { useState } from 'react';
import type { FormaPagamento, FormasPagamentoHabilitadas, OpcoesConsumo } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { FORMAS_PAGAMENTO } from '../../utils/formasPagamento';
import { MensagemRetorno, Opcao, SALVO_PENDENTE, useAcao, type PropsAba } from './comum';

// Explicação de cada forma para o administrador decidir se liga ou não.
const DICAS: Partial<Record<FormaPagamento, string>> = {
  credito: 'Maquininha/pinpad com crédito.',
  debito: 'Maquininha/pinpad com débito.',
  vale_refeicao:
    'Forma própria na nota (não é crédito nem débito). Só para refeições prontas; exige habilitar o vale na credenciadora.',
  vale_alimentacao:
    'Forma própria na nota. Pela Lei 14.442/2022 é para gêneros alimentícios (mercados); em lanchonete, use só se a credenciadora aceitar o seu ramo.',
  dinheiro:
    'Item 2: o totem não recebe cédulas. O cliente paga no caixa com o número do pedido e o funcionário confirma no modo Funcionário, onde a nota é emitida e impressa.',
};

// Item 1: qualquer forma pode ser desligada (inclusive dinheiro, que no totem vira
// "pague no caixa"); só não dá para desligar todas. Item 11: "Para comer aqui" e
// "Para levar", com pelo menos uma ligada.
export function AbaPagamento({ config, salvarConfig }: PropsAba) {
  const [formas, setFormas] = useState<FormasPagamentoHabilitadas>(config.formasPagamento);
  const [consumo, setConsumo] = useState<OpcoesConsumo>(config.consumo);
  const { retorno, ocupado, executar } = useAcao();

  const ligadas = FORMAS_PAGAMENTO.filter(({ valor }) => formas[valor]).length;

  return (
    <form
      className="admin-secao"
      onSubmit={(evento) => {
        evento.preventDefault();
        executar(
          () => salvarConfig({ ...config, formasPagamento: formas, consumo }),
          SALVO_PENDENTE,
        );
      }}
    >
      <h2>Formas de pagamento aceitas no totem</h2>
      <p className="admin-dica">Deixe pelo menos uma ligada.</p>
      {FORMAS_PAGAMENTO.map(({ valor, rotulo, icone }) => (
        <Opcao
          key={valor}
          rotulo={`${icone} ${rotulo}`}
          dica={DICAS[valor]}
          marcado={formas[valor]}
          // A última ligada não desliga: o totem ficaria sem como cobrar.
          travado={formas[valor] && ligadas === 1}
          aoMudar={(ligada) => setFormas((atuais) => ({ ...atuais, [valor]: ligada }))}
        />
      ))}

      <h2>Onde o cliente vai comer</h2>
      <p className="admin-dica">
        Perguntado antes do pagamento. Com só uma ligada, o totem não pergunta.
      </p>
      <Opcao
        rotulo="🍽️ Para comer aqui"
        marcado={consumo.local}
        travado={consumo.local && !consumo.viagem}
        aoMudar={(local) => setConsumo((atual) => ({ ...atual, local }))}
      />
      <Opcao
        rotulo="🛍️ Para levar"
        marcado={consumo.viagem}
        travado={consumo.viagem && !consumo.local}
        aoMudar={(viagem) => setConsumo((atual) => ({ ...atual, viagem }))}
      />

      <MensagemRetorno retorno={retorno} />
      <BotaoTouch type="submit" variante="primario" disabled={ocupado}>
        Salvar pagamento
      </BotaoTouch>
    </form>
  );
}
