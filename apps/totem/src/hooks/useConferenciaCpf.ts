import { useEffect, useState } from 'react';
import type { ClienteFidelidade } from '@totem/shared';
import { consultarCpf, ErroApi } from '../services/apiClient';

// O que se sabe sobre o CPF digitado. A conferência dos dígitos verificadores (US 09) e,
// quando pedida, a busca do cadastro de fidelidade são feitas pela API assim que o 11º
// dígito é digitado; nada é guardado nessa consulta.
export type SituacaoCpf =
  | { tipo: 'incompleto' }
  | { tipo: 'verificando' }
  | { tipo: 'invalido' }
  | { tipo: 'valido'; cliente: ClienteFidelidade | null }
  | { tipo: 'falha'; mensagem: string };

// LGPD: dado pessoal — exige consentimento/criptografia (cpf)
export function useConferenciaCpf(cpf: string, buscarFidelidade: boolean): SituacaoCpf {
  const [situacao, setSituacao] = useState<SituacaoCpf>({ tipo: 'incompleto' });

  useEffect(() => {
    if (cpf.length < 11) {
      setSituacao({ tipo: 'incompleto' });
      return;
    }
    let cancelado = false;
    setSituacao({ tipo: 'verificando' });
    consultarCpf(cpf, buscarFidelidade)
      .then(({ cliente }) => !cancelado && setSituacao({ tipo: 'valido', cliente }))
      .catch((err: Error) => {
        if (cancelado) return;
        if (err instanceof ErroApi && err.status === 400) setSituacao({ tipo: 'invalido' });
        else setSituacao({ tipo: 'falha', mensagem: err.message });
      });
    return () => {
      cancelado = true;
    };
  }, [cpf, buscarFidelidade]);

  return situacao;
}
