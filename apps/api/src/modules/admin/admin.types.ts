import type { TipoDescontoCupom } from '@totem/shared';

// DTOs da tela de administrador. Campos opcionais chegam como `null` quando o
// administrador os deixa em branco (JSON não transporta `undefined`).
export interface ProdutoBody {
  nome: string;
  descricao: string;
  categoria: string;
  precoCentavos: number;
  icone?: string | null;
  imagemUrl?: string | null;
  estoque?: number | null; // null = sem controle de quantidade
  disponivel: boolean;
}

export interface CupomBody {
  codigo: string;
  tipoDesconto: TipoDescontoCupom;
  valor: number;
  validoDe?: string | null;
  validoAte?: string | null;
  limiteUsos?: number | null; // null = sem limite
  ativo: boolean;
}

export interface ClienteBody {
  cpf: string; // LGPD: dado pessoal — exige consentimento/criptografia
  pontos: number;
}

export interface EnviarImagemBody {
  dataUrl: string;
}
