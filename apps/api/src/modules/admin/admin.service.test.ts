import { randomUUID } from 'node:crypto';
import type { ConfigTotem } from '@totem/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { criarConfigPadrao } from '../../db/config-padrao';
import {
  aplicarRascunho,
  clientesFidelidade,
  config,
  cupons,
  descartarRascunho,
  itensCardapio,
  rascunho,
} from '../../db/memory-store';
import { interpretarImagem } from '../../db/persistencia';
import { listarCardapio } from '../cardapio/cardapio.service';
import { adicionarItem } from '../carrinho/carrinho.service';
import { registrarConsentimentos } from '../consentimento/consentimento.service';
import { VERSAO_TERMO } from '../consentimento/termo';
import { aplicarCupom } from '../cupom/cupom.service';
import { atualizarProdutoAoVivo } from '../funcionario/funcionario.service';
import {
  atualizarConfig,
  atualizarCupom,
  atualizarPontosCliente,
  atualizarProduto,
  cadastrarCliente,
  criarCupom,
  criarProduto,
  descartarPendencias,
  excluirCupom,
  listarConsentimentos,
  listarCupons,
  listarProdutos,
  obterConfigAdmin,
  obterPendencias,
  removerCliente,
  removerProduto,
  validarConfig,
} from './admin.service';
import type { CupomBody, ProdutoBody } from './admin.types';

// O que acontece quando o servidor reinicia: as pendências entram em vigor e somem.
function reiniciarServidor(): void {
  aplicarRascunho(rascunho);
  descartarRascunho();
}

afterEach(() => {
  descartarRascunho();
  Object.assign(config, criarConfigPadrao());
});

const noCardapio = async (id: string) => (await listarCardapio({})).find((item) => item.id === id);

// Item 7: tudo o que o Administrador salva só vale depois do reinício do servidor.
describe('pendências do Administrador', () => {
  it('configuração salva fica pendente e só entra em vigor no reinício', async () => {
    const nova = criarConfigPadrao();
    nova.aparencia.nomeEstabelecimento = 'Cantina da Praça';
    await atualizarConfig(nova);

    expect(config.aparencia.nomeEstabelecimento).toBe('Peça Aqui');
    expect((await obterConfigAdmin()).aparencia.nomeEstabelecimento).toBe('Cantina da Praça');
    expect(await obterPendencias()).toEqual({ config: true, produtos: 0, cupons: 0 });

    reiniciarServidor();
    expect(config.aparencia.nomeEstabelecimento).toBe('Cantina da Praça');
    expect(await obterPendencias()).toEqual({ config: false, produtos: 0, cupons: 0 });
  });

  it('descartar desfaz tudo o que estava pendente', async () => {
    const nova = criarConfigPadrao();
    nova.cuponsHabilitados = false;
    await atualizarConfig(nova);
    await criarProduto({
      nome: 'Rascunho',
      descricao: '',
      categoria: 'lanches',
      precoCentavos: 100,
      disponivel: true,
    });
    await descartarPendencias();

    expect(await obterPendencias()).toEqual({ config: false, produtos: 0, cupons: 0 });
    expect((await obterConfigAdmin()).cuponsHabilitados).toBe(true);
    reiniciarServidor();
    expect(itensCardapio.some((item) => item.nome === 'Rascunho')).toBe(false);
  });
});

describe('atualizarConfig', () => {
  it('salva aparência, páginas, formas de pagamento, consumo e fidelidade', async () => {
    const nova = criarConfigPadrao();
    nova.aparencia.nomeEstabelecimento = '  Cantina da Praça  ';
    nova.aparencia.corFundo = '#102A43';
    nova.aparencia.paginas.cardapio = { titulo: 'Menu', descricao: 'Bom apetite!' };
    nova.aparencia.publicidade = {
      imagens: [`/imagens/${randomUUID()}.jpg`],
      segundosPorImagem: 8,
    };
    nova.formasPagamento.dinheiro = false;
    nova.consumo.viagem = false;
    nova.posicaoCategorias = 'direita';
    nova.fidelidade.percentualAcumulo = 2.5;
    nova.urlTermos = 'https://cantina.exemplo.com/termos';

    const salva = await atualizarConfig(nova);
    expect(salva.aparencia.nomeEstabelecimento).toBe('Cantina da Praça');
    expect(salva.aparencia.corFundo).toBe('#102a43');
    expect(salva.aparencia.paginas.cardapio.titulo).toBe('Menu');
    expect(salva.aparencia.publicidade.segundosPorImagem).toBe(8);
    expect(salva.formasPagamento.dinheiro).toBe(false);
    expect(salva.consumo).toEqual({ local: true, viagem: false });
    expect(salva.posicaoCategorias).toBe('direita');
    expect(salva.urlTermos).toBe('https://cantina.exemplo.com/termos');
  });

  it('recusa cor fora do formato hex, nome vazio e valores fora da faixa', () => {
    const comCorErrada = criarConfigPadrao();
    comCorErrada.aparencia.corBarra = 'vermelho';
    expect(() => validarConfig(comCorErrada)).toThrow(/cor em hex/);

    const semNome = criarConfigPadrao();
    semNome.aparencia.nomeEstabelecimento = '   ';
    expect(() => validarConfig(semNome)).toThrow(/Nome do estabelecimento/);

    const percentualAlto = criarConfigPadrao();
    percentualAlto.fidelidade.percentualAcumulo = 150;
    expect(() => validarConfig(percentualAlto)).toThrow(/Percentual de acúmulo/);

    const semEquivalencia = criarConfigPadrao();
    semEquivalencia.fidelidade.pontosPorReal = 0;
    expect(() => validarConfig(semEquivalencia)).toThrow(/Pontos por R\$ 1,00/);
  });

  // Item 1: até o dinheiro pode sair, mas alguma forma precisa ficar.
  it('exige pelo menos uma forma de pagamento e uma opção de consumo', () => {
    const semFormas = criarConfigPadrao();
    for (const forma of Object.keys(
      semFormas.formasPagamento,
    ) as (keyof ConfigTotem['formasPagamento'])[]) {
      semFormas.formasPagamento[forma] = false;
    }
    expect(() => validarConfig(semFormas)).toThrow(
      'Deixe pelo menos uma forma de pagamento ligada',
    );

    const semConsumo = criarConfigPadrao();
    semConsumo.consumo = { local: false, viagem: false };
    expect(() => validarConfig(semConsumo)).toThrow(/Para comer aqui/);
  });

  it('recusa posição de categorias, publicidade e endereço dos termos inválidos', () => {
    const posicao = criarConfigPadrao();
    (posicao as { posicaoCategorias: string }).posicaoCategorias = 'embaixo';
    expect(() => validarConfig(posicao)).toThrow(/topo, esquerda ou direita/);

    const muitas = criarConfigPadrao();
    muitas.aparencia.publicidade.imagens = Array.from(
      { length: 11 },
      () => `/imagens/${randomUUID()}.jpg`,
    );
    expect(() => validarConfig(muitas)).toThrow(/até 10 imagens/);

    const externa = criarConfigPadrao();
    externa.aparencia.publicidade.imagens = ['https://exemplo.com/anuncio.jpg'];
    expect(() => validarConfig(externa)).toThrow(/Imagem inválida/);

    const url = criarConfigPadrao();
    url.urlTermos = 'javascript:alert(1)';
    expect(() => validarConfig(url)).toThrow(/https:/);
  });

  it('recusa configuração incompleta', async () => {
    await expect(atualizarConfig({} as ConfigTotem)).rejects.toMatchObject({ statusCode: 400 });
    expect(await obterPendencias()).toMatchObject({ config: false });
  });

  it('exige emoji no logotipo só quando não há imagem', () => {
    const semLogo = criarConfigPadrao();
    semLogo.aparencia.logoEmoji = '';
    expect(() => validarConfig(semLogo)).toThrow(/Emoji do logotipo/);

    semLogo.aparencia.logoImagemUrl = `/imagens/${randomUUID()}.png`;
    expect(validarConfig(semLogo).aparencia.logoImagemUrl).toMatch(/^\/imagens\//);
  });

  it('categorias com ícone em imagem e capa; ids novos gerados; ordem vale no reinício', async () => {
    const nova = criarConfigPadrao();
    const capa = `/imagens/${randomUUID()}.jpg`;
    nova.categorias = [
      { id: 'bebidas', nome: 'Para beber', capaUrl: capa },
      { id: 'lanches', nome: 'Lanches', iconeImagemUrl: `/imagens/${randomUUID()}.png` },
      { id: 'acompanhamentos', nome: 'Acompanhamentos' },
      { id: 'qualquer-coisa', nome: 'Combos' },
    ];
    const { categorias } = await atualizarConfig(nova);
    expect(categorias[0]).toMatchObject({ id: 'bebidas', nome: 'Para beber', capaUrl: capa });
    expect(categorias[3].id).not.toBe('qualquer-coisa');
    expect((await listarCardapio({}))[0].categoria).toBe('lanches'); // ainda não reiniciou

    reiniciarServidor();
    expect((await listarCardapio({}))[0].categoria).toBe('bebidas');
  });

  it('não remove categoria que ainda tem produtos, contando os produtos pendentes', async () => {
    const nova = criarConfigPadrao();
    nova.categorias = nova.categorias.filter((categoria) => categoria.id === 'lanches');
    expect(() => validarConfig(nova)).toThrow(/"Acompanhamentos" ainda tem/);

    await criarProduto({
      nome: 'Brownie',
      descricao: '',
      categoria: 'sobremesas',
      precoCentavos: 900,
      disponivel: true,
    });
    const semSobremesas = criarConfigPadrao();
    semSobremesas.categorias = semSobremesas.categorias.filter((c) => c.id !== 'sobremesas');
    expect(() => validarConfig(semSobremesas)).toThrow(/"Sobremesas" ainda tem 1 produto/);
  });
});

describe('produtos', () => {
  const produto: ProdutoBody = {
    nome: 'Pudim',
    descricao: 'Fatia generosa',
    categoria: 'sobremesas',
    precoCentavos: 1250,
    icone: '🍮',
    estoque: 3,
    disponivel: true,
  };

  it('produto novo fica pendente: aparece para o Administrador, mas não no totem', async () => {
    const criado = await criarProduto(produto);
    expect(criado.pendente).toBe('novo');
    expect((await listarProdutos()).find((p) => p.id === criado.id)?.pendente).toBe('novo');
    expect(await noCardapio(criado.id)).toBeUndefined();

    reiniciarServidor();
    expect(await noCardapio(criado.id)).toMatchObject({ nome: 'Pudim', precoCentavos: 1250 });
  });

  it('editar guarda só os campos mudados; o que o funcionário mudar nos outros sobrevive', async () => {
    const atual = itensCardapio.find((item) => item.id === 'lanche-duplo')!;
    await atualizarProduto('lanche-duplo', {
      nome: 'Lanche Duplo Especial',
      descricao: atual.descricao,
      categoria: atual.categoria,
      precoCentavos: atual.precoCentavos,
      disponivel: true,
    });
    expect(rascunho.produtos.alterados['lanche-duplo']).toEqual({ nome: 'Lanche Duplo Especial' });
    expect((await noCardapio('lanche-duplo'))?.nome).toBe('Lanche Duplo'); // ainda não reiniciou

    // Enquanto isso, o funcionário troca o preço (vale na hora).
    await atualizarProdutoAoVivo('lanche-duplo', { precoCentavos: 2690 });
    reiniciarServidor();
    expect(await noCardapio('lanche-duplo')).toMatchObject({
      nome: 'Lanche Duplo Especial',
      precoCentavos: 2690,
    });
  });

  it('remover fica pendente e só tira o produto no reinício', async () => {
    const criado = await criarProduto({ ...produto, nome: 'Mousse' });
    reiniciarServidor();

    await removerProduto(criado.id);
    expect((await listarProdutos()).find((p) => p.id === criado.id)?.pendente).toBe('removido');
    expect(await noCardapio(criado.id)).toBeDefined();
    await expect(atualizarProduto(criado.id, produto)).rejects.toMatchObject({ statusCode: 409 });

    reiniciarServidor();
    expect(await noCardapio(criado.id)).toBeUndefined();
    await expect(removerProduto(criado.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('recusa produto sem nome, com preço negativo, categoria inexistente ou foto externa', async () => {
    await expect(criarProduto({ ...produto, nome: '' })).rejects.toThrow(/"Nome"/);
    await expect(criarProduto({ ...produto, precoCentavos: -1 })).rejects.toThrow(/Preço/);
    await expect(criarProduto({ ...produto, precoCentavos: 12.5 })).rejects.toThrow(/Preço/);
    await expect(criarProduto({ ...produto, categoria: 'nao-existe' })).rejects.toThrow(
      /categoria/,
    );
    await expect(criarProduto({ ...produto, estoque: -2 })).rejects.toThrow(/Quantidade/);
    await expect(
      criarProduto({ ...produto, imagemUrl: 'https://exemplo.com/foto.jpg' }),
    ).rejects.toThrow(/Imagem inválida/);
  });
});

// Item 13
describe('combos', () => {
  const combo = (componentes: ProdutoBody['componentes']): ProdutoBody => ({
    nome: 'Combo Clássico',
    descricao: '',
    categoria: 'lanches',
    precoCentavos: 3290,
    estoque: 50,
    disponivel: true,
    componentes,
  });

  it('agrupa itens existentes, com quantidade de cada, sem estoque próprio', async () => {
    const criado = await criarProduto(
      combo([
        { itemCardapioId: 'lanche-classico', quantidade: 1 },
        { itemCardapioId: 'batata-frita', quantidade: 1 },
        { itemCardapioId: 'refrigerante-lata', quantidade: 1 },
      ]),
    );
    expect(criado.componentes).toHaveLength(3);
    expect(criado.estoque).toBeUndefined();

    reiniciarServidor();
    const pedido = await adicionarItem({
      pedidoId: randomUUID(),
      item: { itemCardapioId: criado.id, nome: 'Combo', quantidade: 1 },
    });
    expect(pedido.valorTotalCentavos).toBe(3290);
  });

  it('recusa combo vazio, com item repetido, com combo dentro ou com menos de 2 unidades', async () => {
    await expect(criarProduto(combo([]))).rejects.toThrow('Escolha os itens do combo');
    await expect(
      criarProduto(
        combo([
          { itemCardapioId: 'batata-frita', quantidade: 1 },
          { itemCardapioId: 'batata-frita', quantidade: 2 },
        ]),
      ),
    ).rejects.toThrow(/duas vezes/);
    await expect(
      criarProduto(combo([{ itemCardapioId: 'batata-frita', quantidade: 1 }])),
    ).rejects.toThrow(/pelo menos 2 unidades/);
    await expect(
      criarProduto(combo([{ itemCardapioId: 'nao-existe', quantidade: 2 }])),
    ).rejects.toThrow(/não encontrado/);

    const interno = await criarProduto(combo([{ itemCardapioId: 'batata-frita', quantidade: 2 }]));
    await expect(
      criarProduto(combo([{ itemCardapioId: interno.id, quantidade: 2 }])),
    ).rejects.toThrow(/é um combo e não pode entrar em outro combo/);
  });

  it('não remove nem transforma em combo um item que faz parte de um combo', async () => {
    await criarProduto(combo([{ itemCardapioId: 'refrigerante-lata', quantidade: 2 }]));
    await expect(removerProduto('refrigerante-lata')).rejects.toThrow(
      /faz parte do combo "Combo Clássico"/,
    );

    const refri = itensCardapio.find((item) => item.id === 'refrigerante-lata')!;
    await expect(
      atualizarProduto('refrigerante-lata', {
        nome: refri.nome,
        descricao: refri.descricao,
        categoria: refri.categoria,
        precoCentavos: refri.precoCentavos,
        disponivel: true,
        componentes: [{ itemCardapioId: 'batata-frita', quantidade: 2 }],
      }),
    ).rejects.toThrow(/não pode virar combo/);
  });
});

describe('cupons', () => {
  // US 36: cupom precisa dar algum desconto.
  it('recusa cupom com desconto zero, negativo ou fora do permitido', async () => {
    const casos: [CupomBody['tipoDesconto'], unknown, RegExp][] = [
      ['percentual', 0, /maior que zero/],
      ['percentual', -10, /maior que zero/],
      ['valor_fixo', 0, /maior que zero/],
      ['valor_fixo', -500, /maior que zero/],
      ['percentual', 150, /até 100%/],
      ['percentual', 0.001, /pelo menos 0,01%/],
      ['valor_fixo', 2.5, /centavos inteiros/],
      ['percentual', Number.NaN, /Informe o desconto/],
      ['percentual', '10', /Informe o desconto/],
      ['valor_fixo', null, /Informe o desconto/],
    ];
    for (const [tipoDesconto, valor, mensagem] of casos) {
      const body = { codigo: 'ZERADO', tipoDesconto, valor, ativo: true } as CupomBody;
      await expect(criarCupom(body)).rejects.toThrow(mensagem);
    }
    expect(rascunho.cupons.novos).toHaveLength(0);
  });

  it('não deixa editar um cupom para zero nem aceita pedido mínimo ou teto zerados', async () => {
    await expect(
      atualizarCupom('DESC5', {
        codigo: 'DESC5',
        tipoDesconto: 'valor_fixo',
        valor: 0,
        ativo: true,
      }),
    ).rejects.toThrow(/maior que zero/);
    expect(rascunho.cupons.alterados.DESC5).toBeUndefined();

    const base = { tipoDesconto: 'percentual', valor: 10, ativo: true } as const;
    await expect(
      criarCupom({ ...base, codigo: 'MINIMO0', pedidoMinimoCentavos: 0 }),
    ).rejects.toThrow(/Pedido mínimo" precisa ser maior que zero/);
    await expect(
      criarCupom({ ...base, codigo: 'TETONEG', descontoMaximoCentavos: -100 }),
    ).rejects.toThrow(/Desconto máximo" precisa ser maior que zero/);
  });

  it('marca como "sem desconto" o cupom gravado com valor zero por fora da área restrita', async () => {
    cupons.set('ZERO', { codigo: 'ZERO', tipoDesconto: 'valor_fixo', valor: 0, ativo: true });
    try {
      const lista = await listarCupons();
      expect(lista.find((cupom) => cupom.codigo === 'ZERO')?.situacao).toBe('sem_desconto');
    } finally {
      cupons.delete('ZERO');
    }
  });

  it('cupom novo fica pendente e só é aceito no totem depois do reinício', async () => {
    const cupom = await criarCupom({
      codigo: ' natal25 ',
      tipoDesconto: 'percentual',
      valor: 25,
      validoDe: '2026-01-01T08:00',
      validoAte: '2099-12-25T22:30',
      limiteUsos: 100,
      ativo: true,
    });
    expect(cupom).toMatchObject({ codigo: 'NATAL25', usos: 0, limiteUsos: 100, pendente: 'novo' });

    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'x', quantidade: 1 },
    });
    await expect(aplicarCupom({ pedidoId, codigo: 'NATAL25' })).rejects.toThrow(/inválido/);

    reiniciarServidor();
    await expect(aplicarCupom({ pedidoId, codigo: 'NATAL25' })).resolves.toMatchObject({
      cupom: { codigo: 'NATAL25' },
    });
    await expect(
      criarCupom({ codigo: 'NATAL25', tipoDesconto: 'percentual', valor: 5, ativo: true }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('editar preserva os usos contados nas vendas; excluir fica pendente', async () => {
    cupons.set('USADO', {
      codigo: 'USADO',
      tipoDesconto: 'valor_fixo',
      valor: 300,
      usos: 7,
      ativo: true,
    });
    const editado = await atualizarCupom('USADO', {
      codigo: 'OUTRO',
      tipoDesconto: 'valor_fixo',
      valor: 500,
      limiteUsos: null,
      ativo: false,
    });
    expect(editado).toMatchObject({
      codigo: 'USADO',
      valor: 500,
      usos: 7,
      ativo: false,
      pendente: 'alterado',
    });
    expect(cupons.get('USADO')?.valor).toBe(300);

    cupons.get('USADO')!.usos = 8; // uma venda acontece antes do reinício
    reiniciarServidor();
    expect(cupons.get('USADO')).toMatchObject({ valor: 500, usos: 8, ativo: false });

    await excluirCupom('USADO');
    expect(cupons.has('USADO')).toBe(true);
    reiniciarServidor();
    expect(cupons.has('USADO')).toBe(false);
  });

  // Item 6
  it('aceita cupom atrelado a itens ou categorias, com pedido mínimo e teto', async () => {
    const cupom = await criarCupom({
      codigo: 'LANCHE10',
      tipoDesconto: 'percentual',
      valor: 10,
      aplicaEm: { tipo: 'categorias', ids: ['lanches'] },
      pedidoMinimoCentavos: 3000,
      descontoMaximoCentavos: 5000,
      ativo: true,
    });
    expect(cupom).toMatchObject({
      aplicaEm: { tipo: 'categorias', ids: ['lanches'] },
      pedidoMinimoCentavos: 3000,
      descontoMaximoCentavos: 5000,
    });

    // Teto só existe em cupom percentual.
    const fixo = await criarCupom({
      codigo: 'FIXO5',
      tipoDesconto: 'valor_fixo',
      valor: 500,
      descontoMaximoCentavos: 100,
      ativo: true,
    });
    expect(fixo.descontoMaximoCentavos).toBeUndefined();
  });

  it('recusa restrição com item ou categoria inexistente, ou sem nenhum escolhido', async () => {
    const base = { tipoDesconto: 'percentual', valor: 10, ativo: true } as const;
    await expect(
      criarCupom({ ...base, codigo: 'SEMITEM', aplicaEm: { tipo: 'itens', ids: [] } }),
    ).rejects.toThrow(/Escolha os itens/);
    await expect(
      criarCupom({
        ...base,
        codigo: 'ITEMFALSO',
        aplicaEm: { tipo: 'itens', ids: ['nao-existe'] },
      }),
    ).rejects.toThrow(/Item do cupom não encontrado/);
    await expect(
      criarCupom({
        ...base,
        codigo: 'CATFALSA',
        aplicaEm: { tipo: 'categorias', ids: ['nao-existe'] },
      }),
    ).rejects.toThrow(/Categoria do cupom não encontrado/);
  });

  it('lista os cupons com atributos, situação e marca de pendência', async () => {
    cupons.set('PAUSADO', {
      codigo: 'PAUSADO',
      tipoDesconto: 'valor_fixo',
      valor: 200,
      ativo: false,
    });
    await criarCupom({ codigo: 'NOVO1', tipoDesconto: 'percentual', valor: 5, ativo: true });

    const lista = await listarCupons(new Date('2026-10-15T12:00:00-03:00'));
    const porCodigo = Object.fromEntries(lista.map((cupom) => [cupom.codigo, cupom]));
    expect(porCodigo.BEMVINDO10.situacao).toBe('valido');
    expect(porCodigo.INVALIDO.situacao).toBe('expirado');
    expect(porCodigo.PAUSADO.situacao).toBe('inativo');
    expect(porCodigo.NOVO1).toMatchObject({ situacao: 'valido', pendente: 'novo' });
    cupons.delete('PAUSADO');
  });
});

// US 29
describe('listarConsentimentos', () => {
  it('devolve a trilha de auditoria, da decisão mais recente para a mais antiga', async () => {
    const pedidoId = randomUUID();
    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { cpf_nota: true },
    });
    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { comprovante: false },
    });

    const [ultimo, penultimo] = await listarConsentimentos();
    expect(ultimo).toMatchObject({ pedidoId, finalidade: 'comprovante', aceito: false });
    expect(penultimo).toMatchObject({
      pedidoId,
      finalidade: 'cpf_nota',
      aceito: true,
      versaoTermo: VERSAO_TERMO,
    });
    expect(await listarConsentimentos(1)).toHaveLength(1);
  });
});

// Clientes de fidelidade são dados, não configuração: mudam na hora.
describe('clientes de fidelidade', () => {
  it('cadastra por CPF válido, ajusta os pontos e remove, tudo na hora', async () => {
    const cliente = await cadastrarCliente({ cpf: '529.982.247-25', pontos: 40 });
    expect(cliente.numeroFidelidade).toBe('52998224725');
    expect(clientesFidelidade.has('52998224725')).toBe(true);

    await expect(cadastrarCliente({ cpf: '52998224725', pontos: 0 })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect((await atualizarPontosCliente(cliente.id, { pontos: 90 })).pontos).toBe(90);

    await removerCliente(cliente.id);
    expect(clientesFidelidade.has('52998224725')).toBe(false);
    await expect(removerCliente(cliente.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('recusa CPF inválido e pontos negativos', async () => {
    await expect(cadastrarCliente({ cpf: '12345678900', pontos: 0 })).rejects.toThrow(
      'CPF inválido',
    );
    await expect(cadastrarCliente({ cpf: '11144477735', pontos: -1 })).rejects.toThrow(/Pontos/);
  });
});

describe('interpretarImagem', () => {
  const png = Buffer.from('conteudo-de-imagem').toString('base64');

  it('aceita PNG, JPEG e WebP em base64', () => {
    expect(interpretarImagem(`data:image/png;base64,${png}`).extensao).toBe('png');
    expect(interpretarImagem(`data:image/jpeg;base64,${png}`).extensao).toBe('jpg');
    expect(interpretarImagem(`data:image/webp;base64,${png}`).extensao).toBe('webp');
  });

  it('recusa SVG, texto solto e imagem acima do limite', () => {
    expect(() => interpretarImagem(`data:image/svg+xml;base64,${png}`)).toThrow(
      /PNG, JPEG ou WebP/,
    );
    expect(() => interpretarImagem('nao-e-imagem')).toThrow(/PNG, JPEG ou WebP/);
    expect(() => interpretarImagem(undefined)).toThrow(/PNG, JPEG ou WebP/);

    const grande = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64');
    expect(() => interpretarImagem(`data:image/png;base64,${grande}`)).toThrow(/muito grande/);
  });
});
