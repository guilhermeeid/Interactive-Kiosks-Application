// Tipos de acesso à área restrita do totem (/admin).
// Consumido por: apps/api/src/modules/admin, apps/totem/src/screens/Admin.

// Administrador muda tudo, mas as mudanças dele só entram em vigor quando o servidor é
// reiniciado. Funcionário só marca itens como esgotados e troca preço, foto e descrição,
// e o que ele muda vale na hora.
export type PapelAcesso = 'administrador' | 'funcionario';

// O que o Administrador salvou e ainda não está em vigor.
export type MudancaPendente = 'novo' | 'alterado' | 'removido';

// Registro como o Administrador o vê: como vai ficar depois do reinício, com a marca do
// que ainda está pendente.
export type ComPendencia<T> = T & { pendente?: MudancaPendente };

export interface ResumoPendencias {
  config: boolean;
  produtos: number;
  cupons: number;
}
