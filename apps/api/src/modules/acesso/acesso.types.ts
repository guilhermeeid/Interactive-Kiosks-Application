import type { PapelAcesso } from '@totem/shared';

// DTOs do módulo de acesso ao painel (Card E / US 35).
export interface EntrarBody {
  login: string;
  senha: string;
}

export interface CriarUsuarioBody {
  login: string;
  nome: string;
  papel: PapelAcesso;
  senha: string;
}

export interface RedefinirSenhaBody {
  senha: string;
}
