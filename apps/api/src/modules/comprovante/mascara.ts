// LGPD: CPF e contatos aparecem mascarados em toda tela (totem, caixa, consulta de
// pedidos). Só o servidor vê o dado completo, para emitir a nota e enviar o comprovante.

// ***.456.789-**
export function mascararCpf(cpf: string): string {
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

function mascararTrecho(trecho: string): string {
  return trecho.length <= 2 ? `${trecho[0] ?? ''}*` : `${trecho.slice(0, 2)}***`;
}

// joao.silva@gmail.com -> jo***@gm***.com
export function mascararEmail(email: string): string {
  const [usuario, dominio = ''] = email.split('@');
  const partes = dominio.split('.');
  const sufixo = partes.length > 1 ? `.${partes.slice(1).join('.')}` : '';
  return `${mascararTrecho(usuario)}@${mascararTrecho(partes[0])}${sufixo}`;
}

// 11987654321 -> (11) *****-4321
export function mascararTelefone(telefone: string): string {
  const numeros = telefone.replace(/\D/g, '');
  if (numeros.length < 6) {
    return '****';
  }
  return `(${numeros.slice(0, 2)}) *****-${numeros.slice(-4)}`;
}
