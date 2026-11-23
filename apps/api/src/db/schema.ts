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
  icone_imagem_url: string | null;
  capa_url: string | null;
  ordem: number;
  ativa: boolean; // false = some dos totens com os itens (migration 0006)
}

// Item 7: pendências do Administrador, aplicadas quando o servidor reinicia.
export interface RascunhoAdminRow {
  id: true;
  dados: unknown; // RascunhoSalvo (ver ./persistencia.ts)
  atualizado_em: string;
}

export interface ItemCardapioRow {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  preco_centavos: number;
  imagem_url: string | null;
  icone: string | null;
  estoque: number | null; // null = sem controle de quantidade (sempre null em combo)
  disponivel: boolean;
}

// Item 13: itens que compõem um combo.
export interface ComponenteComboRow {
  combo_id: string;
  item_cardapio_id: string;
  quantidade: number;
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
  aplica_em_tipo: 'itens' | 'categorias' | null; // null = pedido inteiro
  aplica_em_ids: string[] | null;
  pedido_minimo_centavos: number | null;
  desconto_maximo_centavos: number | null; // só no percentual
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
  consumo: 'local' | 'viagem' | null;
  forma_pagamento: string | null;
  pontos_previstos: number; // dinheiro: creditados quando o caixa confirma
  criado_em: string;
  pago_em: string | null;
  transacao_id: string | null; // transação que pagou o pedido
  conciliado_com_atraso: boolean; // Pix confirmado depois de o QR expirar
  pix_sequencia: number; // cobranças Pix criadas (chave de idempotência)
}

// US 11: cada QR Code Pix gerado para um pedido (migration 0006).
export interface CobrancaPixRow {
  transacao_id: string;
  pedido_id: string;
  copia_e_cola: string;
  valor_centavos: number;
  criada_em: string;
  expira_em: string;
  status: 'pendente' | 'paga' | 'expirada' | 'cancelada';
}

// US 15: a NFC-e do pedido, autorizada ou com a falha registrada (migration 0006).
export interface NotaFiscalRow {
  pedido_id: string;
  status: 'autorizada' | 'falha';
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  url_consulta: string | null;
  url_danfe: string | null;
  erro: string | null;
  tentativas: number;
  ultima_tentativa_em: string;
  autorizada_em: string | null;
}

// US 29: trilha de auditoria do consentimento — só inserções, sem o dado pessoal.
export interface RegistroConsentimentoRow {
  id: string;
  pedido_id: string;
  finalidade: 'cpf_nota' | 'fidelidade' | 'comprovante';
  aceito: boolean;
  versao_termo: string;
  registrado_em: string;
  origem: 'totem' | 'balcao'; // balcao = reenvio autorizado no balcão (migration 0006)
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

// US 25: histórico de vendas — só inserções, sem dado pessoal.
export interface VendaRow {
  pedido_id: string;
  numero: string;
  paga_em: string;
  forma_pagamento: string;
  consumo: 'local' | 'viagem' | null;
  cupom: string | null;
}

export interface ItemVendidoRow {
  pedido_id: string;
  item_cardapio_id: string;
  nome: string;
  categoria: string;
  categoria_nome: string;
  quantidade: number;
  valor_centavos: number; // quantidade × preço, antes dos descontos
  desconto_centavos: number; // parte dos descontos do pedido que coube à linha
}
