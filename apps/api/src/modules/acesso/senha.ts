import { compare, hash } from 'bcryptjs';
import { HttpError } from '../../errors';

// Card E / US 35: senhas dos usuários do painel só existem como hash bcrypt (com sal
// próprio embutido). Custo 10 em uso real; nos testes, 4, só para não deixá-los lentos.
const CUSTO = process.env.VITEST ? 4 : 10;

export const TAMANHO_MINIMO_SENHA = 8;
// O bcrypt só considera os primeiros 72 bytes: acima disso, duas senhas diferentes
// poderiam valer como a mesma.
const BYTES_MAXIMOS_SENHA = 72;

export function validarSenhaNova(senha: unknown): string {
  if (typeof senha !== 'string' || senha.length < TAMANHO_MINIMO_SENHA) {
    throw new HttpError(400, `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`);
  }
  if (Buffer.byteLength(senha, 'utf8') > BYTES_MAXIMOS_SENHA) {
    throw new HttpError(400, 'A senha pode ter no máximo 72 caracteres');
  }
  if (senha.trim() !== senha) {
    throw new HttpError(400, 'A senha não pode começar nem terminar com espaço');
  }
  return senha;
}

export function gerarHashSenha(senha: string): Promise<string> {
  return hash(senha, CUSTO);
}

export function senhaConfere(senha: string, senhaHash: string): Promise<boolean> {
  return compare(senha, senhaHash);
}
