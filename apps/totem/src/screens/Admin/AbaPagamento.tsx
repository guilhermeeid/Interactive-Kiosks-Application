import { useState } from 'react';
import type { FormasPagamentoOpcionais } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { MensagemRetorno, Opcao, SALVO_AGUARDA_REINICIO, useAcao, type PropsAba } from './comum';

// Crédito e débito são separados porque têm taxas e equipamentos (maquininha, pinpad)
// diferentes. Dinheiro não pode ser desligado.
export function AbaPagamento({ config, salvarConfig }: PropsAba) {
  const [formas, setFormas] = useState<FormasPagamentoOpcionais>(config.formasPagamento);
  const { retorno, ocupado, executar } = useAcao();

  const alterar = (parcial: Partial<FormasPagamentoOpcionais>) =>
    setFormas((atuais) => ({ ...atuais, ...parcial }));

  return (
    <form
      className="admin-secao"
      onSubmit={(evento) => {
        evento.preventDefault();
        executar(() => salvarConfig({ ...config, formasPagamento: formas }), SALVO_AGUARDA_REINICIO);
      }}
    >
      <h2>Formas de pagamento aceitas no totem</h2>
      <Opcao
        rotulo="💵 Dinheiro"
        dica="Sempre aceito: a recusa de dinheiro é proibida por lei."
        marcado
        travado
      />
      <Opcao
        rotulo="💳 Cartão de crédito"
        marcado={formas.credito}
        aoMudar={(credito) => alterar({ credito })}
      />
      <Opcao
        rotulo="🏧 Cartão de débito"
        marcado={formas.debito}
        aoMudar={(debito) => alterar({ debito })}
      />
      <Opcao rotulo="⚡ Pix" marcado={formas.pix} aoMudar={(pix) => alterar({ pix })} />

      <MensagemRetorno retorno={retorno} />
      <BotaoTouch type="submit" variante="primario" disabled={ocupado}>
        Salvar formas de pagamento
      </BotaoTouch>
    </form>
  );
}
