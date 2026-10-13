import { randomUUID } from 'node:crypto';
import type {
  CategoriaCardapio,
  ClienteFidelidade,
  ConfigTotem,
  Cupom,
  CupomComSituacao,
  ItemCardapio,
  PaginaTotem,
  PedidoAguardandoRetirada,
  RegistroConsentimento,
  TextoPagina,
} from '@totem/shared';
import {
  clientesFidelidade,
  config,
  cupons,
  itensCardapio,
  pedidoAguardaRetirada,
  pedidos,
  persistir,
  registrosConsentimento,
} from '../../db/memory-store';
import { CAMINHO_IMAGEM, salvarImagem } from '../../db/persistencia';
import { HttpError } from '../../errors';
import { situacaoCupom } from '../cupom/cupom.service';
import { cpfValido, limparCpf } from '../identificacao/cpf';
import type { ClienteBody, CupomBody, EnviarImagemBody, ProdutoBody } from './admin.types';

// Regras da tela de administrador do totem. Tudo o que entra aqui vem de um formulário
// e é validado campo a campo antes de alterar o estado; cada alteração é gravada em
// disco. O totem só passa a enxergar as mudanças de configuração quando é reiniciado.

// ---------- Validação de campos ----------

const COR_HEX = /^#[0-9a-f]{6}$/i;
const PAGINAS: PaginaTotem[] = ['cardapio', 'carrinho', 'identificacao', 'pagamento', 'comprovante'];

function texto(valor: unknown, campo: string, maximo: number, obrigatorio = true): string {
  const limpo = typeof valor === 'string' ? valor.trim() : '';
  if (obrigatorio && !limpo) {
    throw new HttpError(400, `Preencha o campo "${campo}"`);
  }
  if (limpo.length > maximo) {
    throw new HttpError(400, `"${campo}" aceita no máximo ${maximo} caracteres`);
  }
  return limpo;
}

function textoOpcional(valor: unknown, campo: string, maximo: number): string | undefined {
  return texto(valor, campo, maximo, false) || undefined;
}

function cor(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !COR_HEX.test(valor)) {
    throw new HttpError(400, `"${campo}" deve ser uma cor em hex, como #d62828`);
  }
  return valor.toLowerCase();
}

function booleano(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') {
    throw new HttpError(400, `Valor inválido em "${campo}"`);
  }
  return valor;
}

function numero(valor: unknown, campo: string, minimo: number, maximo: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < minimo || valor > maximo) {
    throw new HttpError(400, `"${campo}" deve ficar entre ${minimo} e ${maximo}`);
  }
  return valor;
}

function inteiro(valor: unknown, campo: string, minimo: number, maximo: number): number {
  if (!Number.isInteger(valor)) {
    throw new HttpError(400, `"${campo}" deve ser um número inteiro`);
  }
  return numero(valor, campo, minimo, maximo);
}

function imagemOpcional(valor: unknown, campo: string): string | undefined {
  if (valor === null || valor === undefined || valor === '') {
    return undefined;
  }
  if (typeof valor !== 'string' || !CAMINHO_IMAGEM.test(valor)) {
    throw new HttpError(400, `Imagem inválida em "${campo}"`);
  }
  return valor;
}

function dataOpcional(valor: unknown, campo: string): string | undefined {
  if (valor === null || valor === undefined || valor === '') {
    return undefined;
  }
  const data = typeof valor === 'string' ? new Date(valor) : new Date(NaN);
  if (Number.isNaN(data.getTime())) {
    throw new HttpError(400, `Data inválida em "${campo}"`);
  }
  return data.toISOString();
}

// ---------- Configuração (aparência, categorias, fidelidade, pagamento, cupons) ----------

export async function obterConfig(): Promise<ConfigTotem> {
  return config;
}

function validarCategorias(entrada: unknown): CategoriaCardapio[] {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    throw new HttpError(400, 'O cardápio precisa de pelo menos uma categoria');
  }
  if (entrada.length > 20) {
    throw new HttpError(400, 'O cardápio aceita no máximo 20 categorias');
  }

  const categorias = entrada.map((categoria: Partial<CategoriaCardapio>): CategoriaCardapio => ({
    // Só ids que já existem são mantidos; categoria nova recebe um id gerado aqui.
    id: config.categorias.some((atual) => atual.id === categoria?.id)
      ? (categoria.id as string)
      : randomUUID(),
    nome: texto(categoria?.nome, 'Nome da categoria', 30),
    icone: textoOpcional(categoria?.icone, 'Ícone da categoria', 8),
  }));

  const nomes = categorias.map((categoria) => categoria.nome.toLowerCase());
  if (new Set(nomes).size !== nomes.length) {
    throw new HttpError(400, 'Há duas categorias com o mesmo nome');
  }
  if (new Set(categorias.map((categoria) => categoria.id)).size !== categorias.length) {
    throw new HttpError(400, 'A mesma categoria foi enviada duas vezes');
  }

  // Categoria com produtos não some: os produtos ficariam sem aba no totem.
  for (const atual of config.categorias) {
    const produtos = itensCardapio.filter((item) => item.categoria === atual.id).length;
    if (produtos > 0 && !categorias.some((categoria) => categoria.id === atual.id)) {
      throw new HttpError(
        400,
        `A categoria "${atual.nome}" ainda tem ${produtos} produto(s). Mova ou remova-os antes.`,
      );
    }
  }
  return categorias;
}

export function validarConfig(entrada: Partial<ConfigTotem> | undefined): ConfigTotem {
  const aparencia = entrada?.aparencia;
  const fidelidade = entrada?.fidelidade;
  const formas = entrada?.formasPagamento;

  const logoImagemUrl = imagemOpcional(aparencia?.logoImagemUrl, 'Logotipo');
  const paginas = {} as Record<PaginaTotem, TextoPagina>;
  for (const pagina of PAGINAS) {
    paginas[pagina] = {
      titulo: texto(aparencia?.paginas?.[pagina]?.titulo, 'Nome da página', 40),
      descricao: texto(aparencia?.paginas?.[pagina]?.descricao, 'Descrição da página', 120, false),
    };
  }

  return {
    aparencia: {
      nomeEstabelecimento: texto(aparencia?.nomeEstabelecimento, 'Nome do estabelecimento', 40),
      slogan: texto(aparencia?.slogan, 'Frase abaixo do nome', 80, false),
      // Sem imagem, o emoji é o logotipo e não pode ficar vazio.
      logoEmoji: texto(aparencia?.logoEmoji, 'Emoji do logotipo', 8, !logoImagemUrl),
      logoImagemUrl,
      fonteNome: texto(aparencia?.fonteNome, 'Fonte do nome', 40),
      fonteTextos: texto(aparencia?.fonteTextos, 'Fonte dos textos', 40),
      corNome: cor(aparencia?.corNome, 'Cor do nome'),
      corFundo: cor(aparencia?.corFundo, 'Cor do fundo'),
      corBarra: cor(aparencia?.corBarra, 'Cor da barra'),
      paginas,
    },
    categorias: validarCategorias(entrada?.categorias),
    exibirTodos: booleano(entrada?.exibirTodos, 'Exibir "Todos"'),
    fidelidade: {
      habilitado: booleano(fidelidade?.habilitado, 'Programa de fidelidade'),
      acumuloHabilitado: booleano(fidelidade?.acumuloHabilitado, 'Acúmulo de pontos'),
      percentualAcumulo: numero(fidelidade?.percentualAcumulo, 'Percentual de acúmulo', 0, 100),
      pontosPorReal: inteiro(fidelidade?.pontosPorReal, 'Pontos por R$ 1,00', 1, 100000),
      combinaComCupom: booleano(fidelidade?.combinaComCupom, 'Somar pontos com cupom'),
    },
    formasPagamento: {
      credito: booleano(formas?.credito, 'Crédito'),
      debito: booleano(formas?.debito, 'Débito'),
      pix: booleano(formas?.pix, 'Pix'),
    },
    cuponsHabilitados: booleano(entrada?.cuponsHabilitados, 'Aceitar cupons'),
  };
}

export async function atualizarConfig(entrada: Partial<ConfigTotem>): Promise<ConfigTotem> {
  Object.assign(config, validarConfig(entrada));
  persistir();
  return config;
}

export async function enviarImagem(body: EnviarImagemBody): Promise<{ url: string }> {
  return { url: salvarImagem(body?.dataUrl) };
}

// ---------- Produtos ----------

function validarProduto(body: ProdutoBody): Omit<ItemCardapio, 'id'> {
  const categoria = config.categorias.find((c) => c.id === body?.categoria);
  if (!categoria) {
    throw new HttpError(400, 'Escolha uma categoria para o produto');
  }
  return {
    nome: texto(body.nome, 'Nome', 60),
    descricao: texto(body.descricao, 'Descrição', 200, false),
    categoria: categoria.id,
    precoCentavos: inteiro(body.precoCentavos, 'Preço', 0, 10_000_000),
    icone: textoOpcional(body.icone, 'Ícone', 8),
    imagemUrl: imagemOpcional(body.imagemUrl, 'Foto'),
    estoque:
      body.estoque === null || body.estoque === undefined
        ? undefined
        : inteiro(body.estoque, 'Quantidade', 0, 99_999),
    disponivel: booleano(body.disponivel, 'Disponível'),
  };
}

// Devolve os itens como estão cadastrados (o cardápio do totem já mistura estoque e
// disponibilidade num campo só).
export async function listarProdutos(): Promise<ItemCardapio[]> {
  return itensCardapio;
}

export async function criarProduto(body: ProdutoBody): Promise<ItemCardapio> {
  const produto: ItemCardapio = { id: randomUUID(), ...validarProduto(body) };
  itensCardapio.push(produto);
  persistir();
  return produto;
}

export async function atualizarProduto(id: string, body: ProdutoBody): Promise<ItemCardapio> {
  const indice = itensCardapio.findIndex((item) => item.id === id);
  if (indice === -1) {
    throw new HttpError(404, 'Produto não encontrado');
  }
  const produto: ItemCardapio = { id, ...validarProduto(body) };
  itensCardapio[indice] = produto;
  persistir();
  return produto;
}

export async function removerProduto(id: string): Promise<void> {
  const indice = itensCardapio.findIndex((item) => item.id === id);
  if (indice === -1) {
    throw new HttpError(404, 'Produto não encontrado');
  }
  itensCardapio.splice(indice, 1);
  persistir();
}

// ---------- Cupons ----------

// Letras e números apenas: é o que o teclado virtual do totem consegue digitar.
const CODIGO_CUPOM = /^[A-Z0-9]{3,20}$/;

function validarCupomBody(body: CupomBody, usos: number | undefined): Cupom {
  const codigo = typeof body?.codigo === 'string' ? body.codigo.trim().toUpperCase() : '';
  if (!CODIGO_CUPOM.test(codigo)) {
    throw new HttpError(400, 'O código do cupom deve ter de 3 a 20 letras ou números');
  }
  if (body.tipoDesconto !== 'percentual' && body.tipoDesconto !== 'valor_fixo') {
    throw new HttpError(400, 'Escolha o tipo de desconto do cupom');
  }

  const validoDe = dataOpcional(body.validoDe, 'Início da validade');
  const validoAte = dataOpcional(body.validoAte, 'Fim da validade');
  if (validoDe && validoAte && validoDe > validoAte) {
    throw new HttpError(400, 'O fim da validade deve ser depois do início');
  }

  return {
    codigo,
    tipoDesconto: body.tipoDesconto,
    valor:
      body.tipoDesconto === 'percentual'
        ? numero(body.valor, 'Desconto (%)', 0.01, 100)
        : inteiro(body.valor, 'Desconto (R$)', 1, 10_000_000),
    validoDe,
    validoAte,
    limiteUsos:
      body.limiteUsos === null || body.limiteUsos === undefined
        ? undefined
        : inteiro(body.limiteUsos, 'Quantidade de usos', 1, 1_000_000),
    usos,
    ativo: booleano(body.ativo, 'Ativo'),
  };
}

// US 13: todos os cupons, ativos e inativos, com seus atributos e a situação de cada um
// agora — calculada pela mesma regra que o totem usa para aceitar ou recusar.
export async function listarCupons(agora: Date = new Date()): Promise<CupomComSituacao[]> {
  return [...cupons.values()].map((cupom) => ({
    ...cupom,
    situacao: situacaoCupom(cupom, agora),
  }));
}

export async function criarCupom(body: CupomBody): Promise<Cupom> {
  const cupom = validarCupomBody(body, 0);
  if (cupons.has(cupom.codigo)) {
    throw new HttpError(409, `Já existe um cupom "${cupom.codigo}"`);
  }
  cupons.set(cupom.codigo, cupom);
  persistir();
  return cupom;
}

// O código identifica o cupom e não muda; os usos já contados são preservados.
export async function atualizarCupom(codigo: string, body: CupomBody): Promise<Cupom> {
  const atual = cupons.get(codigo);
  if (!atual) {
    throw new HttpError(404, 'Cupom não encontrado');
  }
  const cupom = validarCupomBody({ ...body, codigo }, atual.usos);
  cupons.set(codigo, cupom);
  persistir();
  return cupom;
}

export async function excluirCupom(codigo: string): Promise<void> {
  if (!cupons.delete(codigo)) {
    throw new HttpError(404, 'Cupom não encontrado');
  }
  persistir();
}

// ---------- Clientes de fidelidade ----------
// LGPD: dado pessoal — exige consentimento/criptografia (CPF dos clientes)

function validarPontos(pontos: unknown): number {
  return inteiro(pontos, 'Pontos', 0, 100_000_000);
}

export async function listarClientes(): Promise<ClienteFidelidade[]> {
  return [...clientesFidelidade.values()];
}

export async function cadastrarCliente(body: ClienteBody): Promise<ClienteFidelidade> {
  const cpf = typeof body?.cpf === 'string' ? limparCpf(body.cpf) : '';
  if (!cpfValido(cpf)) {
    throw new HttpError(400, 'CPF inválido');
  }
  if (clientesFidelidade.has(cpf)) {
    throw new HttpError(409, 'Este CPF já está cadastrado na fidelidade');
  }
  const cliente: ClienteFidelidade = {
    id: randomUUID(),
    numeroFidelidade: cpf,
    pontos: validarPontos(body.pontos),
  };
  clientesFidelidade.set(cpf, cliente);
  persistir();
  return cliente;
}

// As rotas identificam o cliente pelo id, não pelo CPF, para o CPF não aparecer em URL
// (e, com isso, no log do servidor).
function obterClientePorId(id: string): ClienteFidelidade {
  const cliente = [...clientesFidelidade.values()].find((c) => c.id === id);
  if (!cliente) {
    throw new HttpError(404, 'Cliente não encontrado');
  }
  return cliente;
}

export async function atualizarPontosCliente(
  id: string,
  body: Pick<ClienteBody, 'pontos'>,
): Promise<ClienteFidelidade> {
  const cliente = obterClientePorId(id);
  cliente.pontos = validarPontos(body?.pontos);
  persistir();
  return cliente;
}

export async function removerCliente(id: string): Promise<void> {
  clientesFidelidade.delete(obterClientePorId(id).numeroFidelidade);
  persistir();
}

// ---------- Auditoria do consentimento (US 29) ----------

// Registros mais recentes primeiro: data, hora, versão do termo, finalidade e decisão.
export async function listarConsentimentos(limite = 200): Promise<RegistroConsentimento[]> {
  return registrosConsentimento.slice(-limite).reverse();
}

// ---------- Pedidos aguardando retirada ----------

// Só o necessário para o balcão conferir o pedido: nada de CPF ou dados do cliente.
export async function listarPedidosAguardando(): Promise<PedidoAguardandoRetirada[]> {
  return [...pedidos.values()]
    .filter(pedidoAguardaRetirada)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
    .map((pedido) => ({
      id: pedido.id,
      numero: pedido.numero as string,
      itens: pedido.itens.map(({ nome, quantidade }) => ({ nome, quantidade })),
      valorAPagarCentavos: pedido.valorAPagarCentavos,
      criadoEm: pedido.criadoEm,
    }));
}

// O "ok" do balcão: o pedido foi entregue e o número dele volta a ficar livre.
export async function confirmarEntrega(pedidoId: string): Promise<void> {
  const pedido = pedidos.get(pedidoId);
  if (!pedido || !pedidoAguardaRetirada(pedido)) {
    throw new HttpError(404, 'Pedido não está aguardando retirada');
  }
  pedido.entregueEm = new Date().toISOString();
  persistir();
}
