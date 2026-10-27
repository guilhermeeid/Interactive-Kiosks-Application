import { randomUUID } from 'node:crypto';
import type {
  CategoriaCardapio,
  ClienteFidelidade,
  ComPendencia,
  ComponenteCombo,
  ConfigTotem,
  Cupom,
  CupomComSituacao,
  FormaPagamento,
  ItemCardapio,
  PaginaTotem,
  PosicaoCategorias,
  RegistroConsentimento,
  RestricaoCupom,
  ResumoPendencias,
  TextoPagina,
} from '@totem/shared';
import {
  clientesFidelidade,
  config,
  cupons,
  descartarRascunho,
  diferencas,
  itensCardapio,
  listaComPendencias,
  persistir,
  persistirRascunho,
  rascunho,
  registrosConsentimento,
} from '../../db/memory-store';
import { salvarImagem } from '../../db/persistencia';
import { HttpError } from '../../errors';
import { problemaNoDesconto, situacaoCupom } from '../cupom/cupom.service';
import { cpfValido, limparCpf } from '../identificacao/cpf';
import type { ClienteBody, CupomBody, EnviarImagemBody, ProdutoBody } from './admin.types';
import {
  booleano,
  centavosOpcional,
  cor,
  dataOpcional,
  imagemOpcional,
  inteiro,
  inteiroOpcional,
  numero,
  texto,
  textoOpcional,
  urlOpcional,
} from './validacao';

// Regras do modo Administrador. Tudo o que entra aqui vem de um formulário e é validado
// campo a campo. Item 7: o que o Administrador salva — configuração, produtos e cupons —
// fica pendente e só entra em vigor quando o servidor é reiniciado (ver
// db/memory-store.ts, `aplicarRascunho`). Por isso as listas daqui mostram como tudo vai
// ficar depois do reinício, com a marca do que ainda está pendente. Clientes de
// fidelidade são dados, não configuração, e mudam na hora.

const PAGINAS: PaginaTotem[] = [
  'inicio',
  'fidelidade',
  'cardapio',
  'carrinho',
  'pagamento',
  'comprovante',
];
const FORMAS: FormaPagamento[] = [
  'credito',
  'debito',
  'pix',
  'vale_refeicao',
  'vale_alimentacao',
  'dinheiro',
];
const NOMES_FORMAS: Record<FormaPagamento, string> = {
  credito: 'Crédito',
  debito: 'Débito',
  pix: 'Pix',
  vale_refeicao: 'Vale-refeição',
  vale_alimentacao: 'Vale-alimentação',
  dinheiro: 'Dinheiro',
};
const POSICOES: PosicaoCategorias[] = ['topo', 'esquerda', 'direita'];

// ---------- Como tudo fica depois do reinício ----------

function configPosReinicio(): ConfigTotem {
  return rascunho.config ?? config;
}

function produtosPosReinicio(): ComPendencia<ItemCardapio>[] {
  return listaComPendencias(itensCardapio, (item) => item.id, rascunho.produtos);
}

// Produtos que continuam existindo depois do reinício.
function produtosQueFicam(): ItemCardapio[] {
  return produtosPosReinicio().filter((produto) => produto.pendente !== 'removido');
}

function cuponsPosReinicio(): ComPendencia<Cupom>[] {
  return listaComPendencias([...cupons.values()], (cupom) => cupom.codigo, rascunho.cupons);
}

function cuponsQueFicam(): Cupom[] {
  return cuponsPosReinicio().filter((cupom) => cupom.pendente !== 'removido');
}

export async function obterPendencias(): Promise<ResumoPendencias> {
  const contar = (lista: typeof rascunho.produtos | typeof rascunho.cupons) =>
    lista.novos.length + lista.removidos.length + Object.keys(lista.alterados).length;
  return {
    config: rascunho.config !== undefined,
    produtos: contar(rascunho.produtos),
    cupons: contar(rascunho.cupons),
  };
}

export async function descartarPendencias(): Promise<void> {
  descartarRascunho();
}

// ---------- Configuração (aparência, categorias, fidelidade, pagamento, cupons) ----------

// A configuração em vigor, lida pelo totem ao iniciar.
export async function obterConfig(): Promise<ConfigTotem> {
  return config;
}

// O que o Administrador vê e edita: a configuração pendente, se houver.
export async function obterConfigAdmin(): Promise<ConfigTotem> {
  return configPosReinicio();
}

function validarCategorias(entrada: unknown): CategoriaCardapio[] {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    throw new HttpError(400, 'O cardápio precisa de pelo menos uma categoria');
  }
  if (entrada.length > 20) {
    throw new HttpError(400, 'O cardápio aceita no máximo 20 categorias');
  }

  const atuais = configPosReinicio().categorias;
  const categorias = entrada.map((categoria: Partial<CategoriaCardapio>): CategoriaCardapio => ({
    // Só ids que já existem são mantidos; categoria nova recebe um id gerado aqui.
    id: atuais.some((atual) => atual.id === categoria?.id)
      ? (categoria.id as string)
      : randomUUID(),
    nome: texto(categoria?.nome, 'Nome da categoria', 30),
    icone: textoOpcional(categoria?.icone, 'Ícone da categoria', 8),
    iconeImagemUrl: imagemOpcional(categoria?.iconeImagemUrl, 'Ícone da categoria'),
    capaUrl: imagemOpcional(categoria?.capaUrl, 'Capa da categoria'),
  }));

  const nomes = categorias.map((categoria) => categoria.nome.toLowerCase());
  if (new Set(nomes).size !== nomes.length) {
    throw new HttpError(400, 'Há duas categorias com o mesmo nome');
  }
  if (new Set(categorias.map((categoria) => categoria.id)).size !== categorias.length) {
    throw new HttpError(400, 'A mesma categoria foi enviada duas vezes');
  }

  // Categoria com produtos (ou presa a um cupom) não some: os produtos ficariam sem aba.
  for (const atual of atuais) {
    if (categorias.some((categoria) => categoria.id === atual.id)) {
      continue;
    }
    const produtos = produtosQueFicam().filter((item) => item.categoria === atual.id).length;
    if (produtos > 0) {
      throw new HttpError(
        400,
        `A categoria "${atual.nome}" ainda tem ${produtos} produto(s). Mova ou remova-os antes.`,
      );
    }
    const cupom = cuponsQueFicam().find(
      (c) => c.aplicaEm?.tipo === 'categorias' && c.aplicaEm.ids.includes(atual.id),
    );
    if (cupom) {
      throw new HttpError(400, `A categoria "${atual.nome}" está no cupom ${cupom.codigo}.`);
    }
  }
  return categorias;
}

export function validarConfig(entrada: Partial<ConfigTotem> | undefined): ConfigTotem {
  const aparencia = entrada?.aparencia;
  const fidelidade = entrada?.fidelidade;
  const formas = entrada?.formasPagamento;
  const consumo = entrada?.consumo;

  const logoImagemUrl = imagemOpcional(aparencia?.logoImagemUrl, 'Logotipo');
  const paginas = {} as Record<PaginaTotem, TextoPagina>;
  for (const pagina of PAGINAS) {
    paginas[pagina] = {
      titulo: texto(aparencia?.paginas?.[pagina]?.titulo, 'Nome da página', 40),
      descricao: texto(aparencia?.paginas?.[pagina]?.descricao, 'Descrição da página', 120, false),
    };
  }

  const imagensPublicidade = aparencia?.publicidade?.imagens;
  if (!Array.isArray(imagensPublicidade) || imagensPublicidade.length > 10) {
    throw new HttpError(400, 'A publicidade aceita até 10 imagens');
  }

  const formasPagamento = {} as Record<FormaPagamento, boolean>;
  for (const forma of FORMAS) {
    formasPagamento[forma] = booleano(formas?.[forma], NOMES_FORMAS[forma]);
  }
  if (!FORMAS.some((forma) => formasPagamento[forma])) {
    throw new HttpError(400, 'Deixe pelo menos uma forma de pagamento ligada');
  }

  const opcoesConsumo = {
    local: booleano(consumo?.local, 'Para comer aqui'),
    viagem: booleano(consumo?.viagem, 'Para levar'),
  };
  if (!opcoesConsumo.local && !opcoesConsumo.viagem) {
    throw new HttpError(400, 'Deixe ligada pelo menos "Para comer aqui" ou "Para levar"');
  }

  const posicaoCategorias = entrada?.posicaoCategorias;
  if (!posicaoCategorias || !POSICOES.includes(posicaoCategorias)) {
    throw new HttpError(400, 'Escolha onde ficam as categorias: topo, esquerda ou direita');
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
      publicidade: {
        imagens: imagensPublicidade.map((imagem) => imagemOpcional(imagem, 'Publicidade') as string),
        segundosPorImagem: inteiro(
          aparencia?.publicidade?.segundosPorImagem,
          'Segundos por imagem',
          3,
          60,
        ),
      },
    },
    categorias: validarCategorias(entrada?.categorias),
    posicaoCategorias,
    exibirTodos: booleano(entrada?.exibirTodos, 'Exibir "Todos"'),
    fidelidade: {
      habilitado: booleano(fidelidade?.habilitado, 'Programa de fidelidade'),
      acumuloHabilitado: booleano(fidelidade?.acumuloHabilitado, 'Acúmulo de pontos'),
      percentualAcumulo: numero(fidelidade?.percentualAcumulo, 'Percentual de acúmulo', 0, 100),
      pontosPorReal: inteiro(fidelidade?.pontosPorReal, 'Pontos por R$ 1,00', 1, 100000),
      combinaComCupom: booleano(fidelidade?.combinaComCupom, 'Somar pontos com cupom'),
    },
    formasPagamento,
    consumo: opcoesConsumo,
    cuponsHabilitados: booleano(entrada?.cuponsHabilitados, 'Aceitar cupons'),
    urlTermos: urlOpcional(entrada?.urlTermos, 'Endereço dos Termos e Condições'),
  };
}

// Fica pendente até o servidor reiniciar.
export async function atualizarConfig(entrada: Partial<ConfigTotem>): Promise<ConfigTotem> {
  rascunho.config = validarConfig(entrada);
  persistirRascunho();
  return rascunho.config;
}

export async function enviarImagem(body: EnviarImagemBody): Promise<{ url: string }> {
  return { url: salvarImagem(body?.dataUrl) };
}

// ---------- Produtos e combos ----------

// Item 13: um combo agrupa itens já cadastrados (que não sejam combos), com quantidade
// de cada um. Não tem estoque próprio: esgota quando qualquer item dele esgota.
function validarComponentes(entrada: unknown, idProprio?: string): ComponenteCombo[] | undefined {
  if (entrada === null || entrada === undefined) {
    return undefined;
  }
  if (!Array.isArray(entrada) || entrada.length === 0) {
    throw new HttpError(400, 'Escolha os itens do combo');
  }
  if (entrada.length > 10) {
    throw new HttpError(400, 'Um combo aceita no máximo 10 itens diferentes');
  }
  const disponiveis = produtosQueFicam();
  const componentes = entrada.map((parte: Partial<ComponenteCombo>): ComponenteCombo => {
    const item = disponiveis.find((produto) => produto.id === parte?.itemCardapioId);
    if (!item || item.id === idProprio) {
      throw new HttpError(400, 'Item do combo não encontrado');
    }
    if (item.componentes) {
      throw new HttpError(400, `"${item.nome}" é um combo e não pode entrar em outro combo`);
    }
    return { itemCardapioId: item.id, quantidade: inteiro(parte.quantidade, `Quantidade de ${item.nome}`, 1, 20) };
  });
  if (new Set(componentes.map((parte) => parte.itemCardapioId)).size !== componentes.length) {
    throw new HttpError(400, 'O mesmo item aparece duas vezes no combo');
  }
  if (componentes.reduce((total, parte) => total + parte.quantidade, 0) < 2) {
    throw new HttpError(400, 'Um combo precisa juntar pelo menos 2 unidades');
  }
  return componentes;
}

// Combos (que ficam depois do reinício) que levam este item.
function combosCom(id: string): ItemCardapio[] {
  return produtosQueFicam().filter((produto) =>
    produto.componentes?.some((parte) => parte.itemCardapioId === id),
  );
}

function validarProduto(body: ProdutoBody, idProprio?: string): Omit<ItemCardapio, 'id'> {
  const categoria = configPosReinicio().categorias.find((c) => c.id === body?.categoria);
  if (!categoria) {
    throw new HttpError(400, 'Escolha uma categoria para o produto');
  }
  const componentes = validarComponentes(body.componentes, idProprio);
  if (componentes && idProprio) {
    const combo = combosCom(idProprio)[0];
    if (combo) {
      throw new HttpError(400, `Este item faz parte do combo "${combo.nome}" e não pode virar combo`);
    }
  }
  return {
    nome: texto(body.nome, 'Nome', 60),
    descricao: texto(body.descricao, 'Descrição', 200, false),
    categoria: categoria.id,
    precoCentavos: inteiro(body.precoCentavos, 'Preço', 0, 10_000_000),
    icone: textoOpcional(body.icone, 'Ícone', 8),
    imagemUrl: imagemOpcional(body.imagemUrl, 'Foto'),
    // O estoque de um combo vem dos itens que o compõem.
    estoque: componentes ? undefined : inteiroOpcional(body.estoque, 'Quantidade', 0, 99_999),
    disponivel: booleano(body.disponivel, 'Disponível'),
    componentes,
  };
}

// Sem campos `undefined`, para comparar e gravar só o que tem valor.
function compactar<T extends object>(registro: T): T {
  return Object.fromEntries(
    Object.entries(registro).filter(([, valor]) => valor !== undefined),
  ) as T;
}

// Como os produtos vão ficar depois do reinício, com a marca do que está pendente.
export async function listarProdutos(): Promise<ComPendencia<ItemCardapio>[]> {
  return produtosPosReinicio();
}

export async function criarProduto(body: ProdutoBody): Promise<ComPendencia<ItemCardapio>> {
  const produto = compactar<ItemCardapio>({ id: randomUUID(), ...validarProduto(body) });
  rascunho.produtos.novos.push(produto);
  persistirRascunho();
  return { ...produto, pendente: 'novo' };
}

export async function atualizarProduto(
  id: string,
  body: ProdutoBody,
): Promise<ComPendencia<ItemCardapio>> {
  if (rascunho.produtos.removidos.includes(id)) {
    throw new HttpError(409, 'Este produto será removido no reinício. Descarte as pendências para editá-lo.');
  }
  const produto = compactar<ItemCardapio>({ id, ...validarProduto(body, id) });

  const indiceNovo = rascunho.produtos.novos.findIndex((novo) => novo.id === id);
  if (indiceNovo !== -1) {
    rascunho.produtos.novos[indiceNovo] = produto;
    persistirRascunho();
    return { ...produto, pendente: 'novo' };
  }

  const atual = itensCardapio.find((item) => item.id === id);
  if (!atual) {
    throw new HttpError(404, 'Produto não encontrado');
  }
  // Só os campos que o administrador mudou ficam pendentes; o resto segue o que está em
  // vigor (inclusive o que o funcionário mudar até o reinício).
  const mudancas = diferencas(atual, produto);
  if (Object.keys(mudancas).length === 0) {
    delete rascunho.produtos.alterados[id];
  } else {
    rascunho.produtos.alterados[id] = mudancas;
  }
  persistirRascunho();
  return produtosPosReinicio().find((item) => item.id === id) as ComPendencia<ItemCardapio>;
}

export async function removerProduto(id: string): Promise<void> {
  const combo = combosCom(id).find((produto) => produto.id !== id);
  if (combo) {
    throw new HttpError(409, `Este item faz parte do combo "${combo.nome}". Tire-o do combo antes.`);
  }
  const cupom = cuponsQueFicam().find(
    (c) => c.aplicaEm?.tipo === 'itens' && c.aplicaEm.ids.includes(id),
  );
  if (cupom) {
    throw new HttpError(409, `Este item está no cupom ${cupom.codigo}. Tire-o do cupom antes.`);
  }

  const indiceNovo = rascunho.produtos.novos.findIndex((novo) => novo.id === id);
  if (indiceNovo !== -1) {
    rascunho.produtos.novos.splice(indiceNovo, 1);
  } else if (itensCardapio.some((item) => item.id === id)) {
    if (!rascunho.produtos.removidos.includes(id)) {
      rascunho.produtos.removidos.push(id);
    }
    delete rascunho.produtos.alterados[id];
  } else {
    throw new HttpError(404, 'Produto não encontrado');
  }
  persistirRascunho();
}

// ---------- Cupons ----------

// Letras e números apenas: é o que o teclado virtual do totem consegue digitar.
const CODIGO_CUPOM = /^[A-Z0-9]{3,20}$/;

// Item 6: cupom só para alguns itens ou categorias (que existam depois do reinício).
function validarRestricao(entrada: unknown): RestricaoCupom | undefined {
  if (entrada === null || entrada === undefined) {
    return undefined;
  }
  const restricao = entrada as Partial<RestricaoCupom>;
  if (restricao.tipo !== 'itens' && restricao.tipo !== 'categorias') {
    throw new HttpError(400, 'Escolha se o cupom vale para itens ou para categorias');
  }
  if (!Array.isArray(restricao.ids) || restricao.ids.length === 0) {
    throw new HttpError(400, `Escolha ${restricao.tipo === 'itens' ? 'os itens' : 'as categorias'} do cupom`);
  }
  const existentes =
    restricao.tipo === 'itens'
      ? produtosQueFicam().map((produto) => produto.id)
      : configPosReinicio().categorias.map((categoria) => categoria.id);
  const ids = [...new Set(restricao.ids)];
  if (!ids.every((id) => typeof id === 'string' && existentes.includes(id))) {
    throw new HttpError(400, `${restricao.tipo === 'itens' ? 'Item' : 'Categoria'} do cupom não encontrado`);
  }
  return { tipo: restricao.tipo, ids };
}

function validarCupomBody(body: CupomBody): Omit<Cupom, 'usos'> {
  const codigo = typeof body?.codigo === 'string' ? body.codigo.trim().toUpperCase() : '';
  if (!CODIGO_CUPOM.test(codigo)) {
    throw new HttpError(400, 'O código do cupom deve ter de 3 a 20 letras ou números');
  }
  // US 36: nada de cupom zerado, negativo ou acima de 100%.
  const problema = problemaNoDesconto(body.tipoDesconto, body.valor);
  if (problema) {
    throw new HttpError(400, problema);
  }

  const validoDe = dataOpcional(body.validoDe, 'Início da validade');
  const validoAte = dataOpcional(body.validoAte, 'Fim da validade');
  if (validoDe && validoAte && validoDe > validoAte) {
    throw new HttpError(400, 'O fim da validade deve ser depois do início');
  }

  return compactar({
    codigo,
    tipoDesconto: body.tipoDesconto,
    valor: body.valor as number,
    validoDe,
    validoAte,
    limiteUsos: inteiroOpcional(body.limiteUsos, 'Quantidade de usos', 1, 1_000_000),
    aplicaEm: validarRestricao(body.aplicaEm),
    pedidoMinimoCentavos: centavosOpcional(body.pedidoMinimoCentavos, 'Pedido mínimo'),
    // Teto só faz sentido para desconto em percentual.
    descontoMaximoCentavos:
      body.tipoDesconto === 'percentual'
        ? centavosOpcional(body.descontoMaximoCentavos, 'Desconto máximo')
        : undefined,
    ativo: booleano(body.ativo, 'Ativo'),
  });
}

// US 13: todos os cupons, ativos e inativos, com seus atributos e a situação de cada um
// — calculada pela mesma regra que o totem usa para aceitar ou recusar. Mostra como vão
// ficar depois do reinício, com a marca do que está pendente.
export async function listarCupons(
  agora: Date = new Date(),
): Promise<ComPendencia<CupomComSituacao>[]> {
  return cuponsPosReinicio().map((cupom) => ({ ...cupom, situacao: situacaoCupom(cupom, agora) }));
}

export async function criarCupom(body: CupomBody): Promise<ComPendencia<Cupom>> {
  const cupom: Cupom = { ...validarCupomBody(body), usos: 0 };
  if (cuponsPosReinicio().some((existente) => existente.codigo === cupom.codigo)) {
    throw new HttpError(409, `Já existe um cupom "${cupom.codigo}"`);
  }
  rascunho.cupons.novos.push(cupom);
  persistirRascunho();
  return { ...cupom, pendente: 'novo' };
}

// O código identifica o cupom e não muda; os usos contados nas vendas são preservados.
export async function atualizarCupom(codigo: string, body: CupomBody): Promise<ComPendencia<Cupom>> {
  if (rascunho.cupons.removidos.includes(codigo)) {
    throw new HttpError(409, 'Este cupom será excluído no reinício. Descarte as pendências para editá-lo.');
  }
  const dados = validarCupomBody({ ...body, codigo });

  const indiceNovo = rascunho.cupons.novos.findIndex((novo) => novo.codigo === codigo);
  if (indiceNovo !== -1) {
    const cupom = { ...dados, usos: 0 };
    rascunho.cupons.novos[indiceNovo] = cupom;
    persistirRascunho();
    return { ...cupom, pendente: 'novo' };
  }

  const atual = cupons.get(codigo);
  if (!atual) {
    throw new HttpError(404, 'Cupom não encontrado');
  }
  const mudancas = diferencas(atual, compactar({ ...dados, usos: atual.usos }));
  if (Object.keys(mudancas).length === 0) {
    delete rascunho.cupons.alterados[codigo];
  } else {
    rascunho.cupons.alterados[codigo] = mudancas;
  }
  persistirRascunho();
  return cuponsPosReinicio().find((cupom) => cupom.codigo === codigo) as ComPendencia<Cupom>;
}

export async function excluirCupom(codigo: string): Promise<void> {
  const indiceNovo = rascunho.cupons.novos.findIndex((novo) => novo.codigo === codigo);
  if (indiceNovo !== -1) {
    rascunho.cupons.novos.splice(indiceNovo, 1);
  } else if (cupons.has(codigo)) {
    if (!rascunho.cupons.removidos.includes(codigo)) {
      rascunho.cupons.removidos.push(codigo);
    }
    delete rascunho.cupons.alterados[codigo];
  } else {
    throw new HttpError(404, 'Cupom não encontrado');
  }
  persistirRascunho();
}

// ---------- Clientes de fidelidade ----------
// LGPD: dado pessoal — exige consentimento/criptografia (CPF dos clientes)
// São dados, não configuração: mudam na hora.

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
// (e, com isso, no log do servidor). O id também é o que vai no QR Code do cartão.
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
