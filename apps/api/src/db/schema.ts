// Representação em TypeScript das tabelas definidas em db/migrations.
// TODO: escolher e configurar um query builder/ORM (ex.: Drizzle, Kysely) para
// substituir estes tipos por schema tipado com queries. Por ora, apenas o formato
// das linhas de cada tabela, espelhando packages/shared/src/types.

export interface ItemCardapioRow {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  preco_centavos: number;
  imagem_url: string | null;
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
  valido_ate: string | null;
  ativo: boolean;
}

export interface PedidoRow {
  id: string;
  status: string;
  cliente_id: string | null;
  cpf_na_nota: string | null; // LGPD: dado pessoal — exige consentimento/criptografia
  cupom_codigo: string | null;
  valor_total_centavos: number;
  criado_em: string;
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
