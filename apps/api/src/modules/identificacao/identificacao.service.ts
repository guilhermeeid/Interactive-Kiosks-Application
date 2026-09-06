import type { ClienteFidelidade, Pedido } from '@totem/shared';
import type { InformarCpfNotaBody, InformarFidelidadeBody } from './identificacao.types';

// TODO: implementar US-04 (Informar fidelidade) — buscar/validar cliente pelo número
// de fidelidade e vincular ao pedido.
// LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade)
export async function informarFidelidade(body: InformarFidelidadeBody): Promise<ClienteFidelidade> {
  throw new Error('informarFidelidade não implementado');
}

// TODO: implementar US-05 (Informar CPF na nota) — validar formato do CPF e
// vincular ao pedido para emissão fiscal (ver integrations/api-fiscal).
// LGPD: dado pessoal — exige consentimento/criptografia (cpf)
export async function informarCpfNota(body: InformarCpfNotaBody): Promise<Pedido> {
  throw new Error('informarCpfNota não implementado');
}
