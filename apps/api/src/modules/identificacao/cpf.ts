// LGPD: dado pessoal — exige consentimento/criptografia (cpf)

export function limparCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

// Confere os dois dígitos verificadores do CPF. Não garante que o CPF exista na
// Receita, só descarta números digitados errado ou inventados.
export function cpfValido(cpf: string): boolean {
  const digitos = limparCpf(cpf);
  // Sequências repetidas (000.000.000-00, 111.111.111-11...) passam na conta dos
  // dígitos, mas não são CPFs reais.
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) {
    return false;
  }

  // Dígito verificador calculado sobre os `tamanho` primeiros dígitos, com pesos
  // decrescentes de tamanho + 1 até 2.
  const digitoVerificador = (tamanho: number): number => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(digitos[i]) * (tamanho + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digitoVerificador(9) === Number(digitos[9]) && digitoVerificador(10) === Number(digitos[10]);
}
