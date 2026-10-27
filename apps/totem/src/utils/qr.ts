// Conteúdo dos códigos que a câmera do totem entende. Os QR são gerados na área
// restrita: o do cupom leva o código; o do cartão de fidelidade leva o id do cadastro,
// nunca o CPF. Um código de barras (ou QR de outra ferramenta) com só o código do cupom
// também vale (US 18).
const PREFIXO_CUPOM = 'TOTEM-CUPOM:';
const PREFIXO_FIDELIDADE = 'TOTEM-FIDELIDADE:';
const CODIGO_CUPOM = /^[A-Z0-9]{3,20}$/;

export type CodigoInterpretado =
  | { tipo: 'cupom'; codigo: string }
  | { tipo: 'fidelidade'; codigo: string }
  | { tipo: 'desconhecido' };

export function qrDeCupom(codigo: string): string {
  return `${PREFIXO_CUPOM}${codigo}`;
}

export function qrDeFidelidade(idCliente: string): string {
  return `${PREFIXO_FIDELIDADE}${idCliente}`;
}

export function interpretarCodigo(conteudo: string): CodigoInterpretado {
  const texto = conteudo.trim();
  if (texto.startsWith(PREFIXO_CUPOM)) {
    const codigo = texto.slice(PREFIXO_CUPOM.length).toUpperCase();
    return CODIGO_CUPOM.test(codigo) ? { tipo: 'cupom', codigo } : { tipo: 'desconhecido' };
  }
  if (texto.startsWith(PREFIXO_FIDELIDADE)) {
    const codigo = texto.slice(PREFIXO_FIDELIDADE.length);
    return codigo ? { tipo: 'fidelidade', codigo } : { tipo: 'desconhecido' };
  }
  if (CODIGO_CUPOM.test(texto.toUpperCase())) {
    return { tipo: 'cupom', codigo: texto.toUpperCase() };
  }
  return { tipo: 'desconhecido' };
}
