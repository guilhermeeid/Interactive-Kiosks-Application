// Tipos de acesso à área restrita do totem (/admin).
// Consumido por: apps/api/src/modules/acesso, apps/api/src/modules/admin,
// apps/totem/src/screens/Admin.

// Card E / US 35: cada usuário do painel tem um perfil (papel), que define o que ele
// pode fazer. Administrador muda tudo, mas as mudanças dele só entram em vigor quando o
// servidor é reiniciado. Funcionário só marca itens como esgotados, troca preço, foto e
// descrição e cuida do caixa e do balcão; o que ele muda vale na hora.
export type PapelAcesso = 'administrador' | 'funcionario';

// Usuário do painel como a API o mostra: nunca leva a senha nem o hash dela.
export interface UsuarioPainel {
  id: string;
  login: string;
  nome: string;
  papel: PapelAcesso;
  criadoEm: string;
  // Presente enquanto o login está bloqueado por senhas erradas seguidas.
  bloqueadoAte?: string;
}

// Devolvida ao entrar. O token vai no cabeçalho `Authorization: Bearer <token>` de cada
// chamada; a sessão termina sozinha depois de `inatividadeMaximaMinutos` sem uso.
export interface SessaoPainel {
  token: string;
  usuario: UsuarioPainel;
  inatividadeMaximaMinutos: number;
}

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
