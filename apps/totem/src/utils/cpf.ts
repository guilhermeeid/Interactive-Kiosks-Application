// Máscara de exibição do CPF enquanto o cliente digita: 000.000.000-00.
// A validação dos dígitos verificadores é feita só na API (modules/identificacao/cpf.ts).
// LGPD: dado pessoal — exige consentimento/criptografia (cpf)
export function formatarCpf(digitos: string): string {
  return digitos
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

// Só o miolo do CPF aparece na tela do totem, que é pública: ***.456.789-**
export function mascararCpf(digitos: string): string {
  return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
}
