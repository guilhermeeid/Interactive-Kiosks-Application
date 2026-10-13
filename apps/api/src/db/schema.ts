// Representação em TypeScript das tabelas definidas em db/migrations.
// TODO: escolher e configurar um query builder/ORM (ex.: Drizzle, Kysely) para
// substituir estes tipos por schema tipado com queries. Por ora, apenas o formato
// das linhas de cada tabela, espelhando packages/shared/src/types.
//
// Nota: enquanto essa integração real não existe, os módulos de negócio usam o
// armazenamento em memória de ./memory-store.ts, que segue os mesmos tipos.

import type { ConfigTotem } from '@totem/shared';

// Linha única; as categorias ficam em CategoriaCardapioRow.
export interface ConfiguracaoTotemRow {
  id: true;
  dados: Omit<ConfigTotem, 'categorias'>;
}

export interface CategoriaCardapioRow {
  id: string;
  nome: string;
  icone: string | null;
  ordem: number;
}

export interface ItemCardapioRow {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  preco_centavos: number;
  imagem_url: string | null;
  icone: string | null;
  estoque: number | null; // null = sem controle de quantidade
  disponivel: boolean;
}

export interface ClienteFidelidadeRow {
  id: string;
  numero_fidelidade: string; // LGPD: dado pessoal — exige consentimento/criptografia
  pontos: number;
}

export interface CupomRow {
  codigo: string;
  tipo_desconto: 'percentual' | 'valor_fixo';
  valor: number;
  valido_de: string | null;
  valido_ate: string | null;
  limite_usos: number | null; // null = sem limite
  usos: number;
  ativo: boolean;
}

export interface PedidoRow {
  id: string;
  status: string;
  cliente_id: string | null;
  cpf_na_nota: string | null; // LGPD: dado pessoal — exige consentimento/criptografia
  cupom_codigo: string | null;
  pontos_usados: number;
  pontos_acumulados: number;
  valor_total_centavos: number;
  desconto_cupom_centavos: number;
  desconto_pontos_centavos: number;
  valor_a_pagar_centavos: number;
  numero: string | null; // três dígitos; único entre pedidos ainda não entregues
  entregue_em: string | null;
  sem_dados_pessoais: boolean; // US 10: cliente pulou a identificação
  criado_em: string;
}

// US 29: trilha de auditoria do consentimento — só inserções, sem o dado pessoal.
export interface RegistroConsentimentoRow {
  id: string;
  pedido_id: string;
  finalidade: 'cpf_nota' | 'fidelidade' | 'comprovante';
  aceito: boolean;
  versao_termo: string;
  registrado_em: string;
}

export interface ItemPedidoRow {
  id: string;
  pedido_id: string;
  item_cardapio_id: string;
  quantidade: number;
  preco_unitario_centavos: number;
  observacoes: string | null;
}

export interface ComprovanteRow {
  id: string;
  pedido_id: string;
  canal: 'email' | 'sms';
  destino: string; // LGPD: dado pessoal — exige consentimento/criptografia
  nota_fiscal_url: string | null;
  enviado_em: string | null;
}
