// Erro de uma integração externa que não respondeu a tempo (banco, SEFAZ). Quem chamou
// não sabe se a operação aconteceu do outro lado: por isso as chamadas que podem ser
// repetidas usam chave de idempotência (ver gateway-pagamento).
export class ErroTempoEsgotado extends Error {}

// Rejeita com ErroTempoEsgotado se `promessa` não terminar em `ms` milissegundos.
export function comTempoLimite<T>(promessa: Promise<T>, ms: number, mensagem: string): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    temporizador = setTimeout(() => rejeitar(new ErroTempoEsgotado(mensagem)), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(temporizador));
}
