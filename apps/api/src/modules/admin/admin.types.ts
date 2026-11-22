import type {
  ComponenteCombo,
  ConfigTotem,
  RestricaoCupom,
  TipoDescontoCupom,
} from '@totem/shared';

// DTOs da área restrita. Campos opcionais chegam como `null` quando o administrador os
// deixa em branco (JSON não transporta `undefined`).

// A configuração inteira. Card E / US 33: desativar uma categoria que tem produtos exige
// confirmação explícita — o id dela vai em `confirmarDesativacao`.
export type AtualizarConfigBody = ConfigTotem & { confirmarDesativacao?: string[] };

export interface ProdutoBody {
  nome: string;
  descricao: string;
  categoria: string;
  precoCentavos: number;
  icone?: string | null;
  imagemUrl?: string | null;
  estoque?: number | null; // null = sem controle de quantidade (ignorado em combos)
  disponivel: boolean;
  componentes?: ComponenteCombo[] | null; // presente = é um combo
}

export interface CupomBody {
  codigo: string;
  tipoDesconto: TipoDescontoCupom;
  valor: number;
  validoDe?: string | null;
  validoAte?: string | null;
  limiteUsos?: number | null; // null = sem limite
  aplicaEm?: RestricaoCupom | null; // null = pedido inteiro
  pedidoMinimoCentavos?: number | null;
  descontoMaximoCentavos?: number | null; // só em cupom percentual
  ativo: boolean;
}

export interface ClienteBody {
  cpf: string; // LGPD: dado pessoal — exige consentimento/criptografia
  pontos: number;
}

export interface EnviarImagemBody {
  dataUrl: string;
}

// Modo Funcionário: o que pode mudar num produto, e vale na hora.
export interface ProdutoAoVivoBody {
  disponivel?: boolean;
  precoCentavos?: number;
  descricao?: string;
  imagemUrl?: string | null; // null = tirar a foto
}
