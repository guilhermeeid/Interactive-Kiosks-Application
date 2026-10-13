import { randomUUID } from 'node:crypto';
import type { ConfigTotem } from '@totem/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { criarConfigPadrao } from '../../db/config-padrao';
import { clientesFidelidade, config, cupons, itensCardapio } from '../../db/memory-store';
import { interpretarImagem } from '../../db/persistencia';
import { MockPagamentoGateway } from '../../integrations/gateway-pagamento';
import { listarCardapio } from '../cardapio/cardapio.service';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { registrarConsentimentos } from '../consentimento/consentimento.service';
import { VERSAO_TERMO } from '../consentimento/termo';
import { aplicarCupom } from '../cupom/cupom.service';
import { escolherFormaPagamento } from '../pagamento/pagamento.service';
import {
  atualizarConfig,
  atualizarCupom,
  atualizarPontosCliente,
  atualizarProduto,
  cadastrarCliente,
  confirmarEntrega,
  criarCupom,
  criarProduto,
  excluirCupom,
  listarConsentimentos,
  listarCupons,
  listarPedidosAguardando,
  removerCliente,
  removerProduto,
  validarConfig,
} from './admin.service';
import type { ProdutoBody } from './admin.types';

afterEach(() => {
  Object.assign(config, criarConfigPadrao());
});

describe('atualizarConfig', () => {
  it('salva aparência, páginas, formas de pagamento e fidelidade', async () => {
    const nova = criarConfigPadrao();
    nova.aparencia.nomeEstabelecimento = '  Cantina da Praça  ';
    nova.aparencia.corFundo = '#102A43';
    nova.aparencia.paginas.cardapio = { titulo: 'Menu', descricao: 'Bom apetite!' };
    nova.formasPagamento.pix = false;
    nova.fidelidade.percentualAcumulo = 2.5;

    const salva = await atualizarConfig(nova);
    expect(salva.aparencia.nomeEstabelecimento).toBe('Cantina da Praça');
    expect(salva.aparencia.corFundo).toBe('#102a43');
    expect(config.aparencia.paginas.cardapio.titulo).toBe('Menu');
    expect(config.formasPagamento.pix).toBe(false);
    expect(config.fidelidade.percentualAcumulo).toBe(2.5);
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

  it('recusa configuração incompleta sem alterar a atual', async () => {
    await expect(atualizarConfig({} as ConfigTotem)).rejects.toMatchObject({ statusCode: 400 });
    expect(config.aparencia.nomeEstabelecimento).toBe('Peça Aqui');
  });

  it('exige emoji no logotipo só quando não há imagem', () => {
    const semLogo = criarConfigPadrao();
    semLogo.aparencia.logoEmoji = '';
    expect(() => validarConfig(semLogo)).toThrow(/Emoji do logotipo/);

    semLogo.aparencia.logoImagemUrl = `/imagens/${randomUUID()}.png`;
    expect(validarConfig(semLogo).aparencia.logoImagemUrl).toMatch(/^\/imagens\//);

    semLogo.aparencia.logoImagemUrl = 'https://exemplo.com/logo.png';
    expect(() => validarConfig(semLogo)).toThrow(/Imagem inválida/);
  });

  it('renomeia, reordena e cria categorias, gerando o id das novas', async () => {
    const nova = criarConfigPadrao();
    nova.categorias = [
      { id: 'bebidas', nome: 'Para beber', icone: '🧃' },
      { id: 'lanches', nome: 'Lanches' },
      { id: 'acompanhamentos', nome: 'Acompanhamentos' },
      { id: 'qualquer-coisa', nome: 'Combos' },
    ];
    const { categorias } = await atualizarConfig(nova);

    expect(categorias.map((c) => c.nome)).toEqual([
      'Para beber',
      'Lanches',
      'Acompanhamentos',
      'Combos',
    ]);
    expect(categorias[0].id).toBe('bebidas');
    expect(categorias[3].id).not.toBe('qualquer-coisa');

    // A aba "Todos" segue a nova ordem das categorias.
    const itens = await listarCardapio({});
    expect(itens[0].categoria).toBe('bebidas');
  });

  it('não remove categoria que ainda tem produtos', () => {
    const nova = criarConfigPadrao();
    nova.categorias = nova.categorias.filter((categoria) => categoria.id !== 'lanches');
    expect(() => validarConfig(nova)).toThrow(/"Lanches" ainda tem 2 produto/);
  });

  it('recusa categorias com nome repetido ou lista vazia', () => {
    const repetida = criarConfigPadrao();
    repetida.categorias[1].nome = 'lanches';
    expect(() => validarConfig(repetida)).toThrow(/mesmo nome/);

    const vazia = criarConfigPadrao();
    vazia.categorias = [];
    expect(() => validarConfig(vazia)).toThrow(/pelo menos uma categoria/);
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

  it('cria, edita e remove um produto, que aparece no cardápio do totem', async () => {
    const criado = await criarProduto(produto);
    expect(await listarCardapio({ categoria: 'sobremesas' })).toContainEqual(criado);

    const editado = await atualizarProduto(criado.id, { ...produto, precoCentavos: 1400, estoque: null });
    expect(editado.precoCentavos).toBe(1400);
    expect(editado.estoque).toBeUndefined();

    await removerProduto(criado.id);
    expect(itensCardapio.some((item) => item.id === criado.id)).toBe(false);
    await expect(removerProduto(criado.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('produto sem unidades aparece como indisponível no totem', async () => {
    const criado = await criarProduto({ ...produto, nome: 'Mousse', estoque: 0 });
    const noCardapio = (await listarCardapio({})).find((item) => item.id === criado.id);
    expect(noCardapio?.disponivel).toBe(false);
    await removerProduto(criado.id);
  });

  it('recusa produto sem nome, com preço negativo, categoria inexistente ou foto externa', async () => {
    await expect(criarProduto({ ...produto, nome: '' })).rejects.toThrow(/"Nome"/);
    await expect(criarProduto({ ...produto, precoCentavos: -1 })).rejects.toThrow(/Preço/);
    await expect(criarProduto({ ...produto, precoCentavos: 12.5 })).rejects.toThrow(/Preço/);
    await expect(criarProduto({ ...produto, categoria: 'nao-existe' })).rejects.toThrow(/categoria/);
    await expect(criarProduto({ ...produto, estoque: -2 })).rejects.toThrow(/Quantidade/);
    await expect(
      criarProduto({ ...produto, imagemUrl: 'https://exemplo.com/foto.jpg' }),
    ).rejects.toThrow(/Imagem inválida/);
  });
});

describe('cupons', () => {
  it('cria cupom com vigência e limite de usos, normalizando o código', async () => {
    const cupom = await criarCupom({
      codigo: ' natal25 ',
      tipoDesconto: 'percentual',
      valor: 25,
      validoDe: '2026-12-20T08:00',
      validoAte: '2026-12-25T22:30',
      limiteUsos: 100,
      ativo: true,
    });
    expect(cupom.codigo).toBe('NATAL25');
    expect(cupom.usos).toBe(0);
    expect(cupom.limiteUsos).toBe(100);
    expect(new Date(cupom.validoAte as string).getTime()).toBeGreaterThan(
      new Date(cupom.validoDe as string).getTime(),
    );

    await expect(
      criarCupom({ codigo: 'NATAL25', tipoDesconto: 'percentual', valor: 5, ativo: true }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await excluirCupom('NATAL25');
    expect(cupons.has('NATAL25')).toBe(false);
  });

  it('ao editar, preserva os usos já contados', async () => {
    cupons.set('USADO', { codigo: 'USADO', tipoDesconto: 'valor_fixo', valor: 300, usos: 7, ativo: true });
    const cupom = await atualizarCupom('USADO', {
      codigo: 'OUTRO',
      tipoDesconto: 'valor_fixo',
      valor: 500,
      limiteUsos: null,
      ativo: false,
    });
    expect(cupom).toMatchObject({ codigo: 'USADO', valor: 500, usos: 7, ativo: false });
    cupons.delete('USADO');
  });

  it('recusa código inválido, desconto fora da faixa e validade invertida', async () => {
    const base = { tipoDesconto: 'percentual', valor: 10, ativo: true } as const;
    await expect(criarCupom({ ...base, codigo: 'A-B' })).rejects.toThrow(/letras ou números/);
    await expect(criarCupom({ ...base, codigo: 'CEMPORCENTO', valor: 101 })).rejects.toThrow(
      /Desconto/,
    );
    await expect(
      criarCupom({ ...base, codigo: 'INVERTIDO', validoDe: '2026-12-25', validoAte: '2026-12-20' }),
    ).rejects.toThrow(/fim da validade/);
    await expect(criarCupom({ ...base, codigo: 'SEMUSOS', limiteUsos: 0 })).rejects.toThrow(
      /Quantidade de usos/,
    );
  });
});

// US 13: o administrador vê todos os cupons, ativos e inativos, com os atributos de cada um.
describe('listarCupons', () => {
  it('lista os cupons com atributos e a situação de cada um no totem', async () => {
    cupons.set('PAUSADO', { codigo: 'PAUSADO', tipoDesconto: 'valor_fixo', valor: 200, ativo: false });
    cupons.set('ACABOU', {
      codigo: 'ACABOU',
      tipoDesconto: 'percentual',
      valor: 5,
      limiteUsos: 2,
      usos: 2,
      ativo: true,
    });

    const lista = await listarCupons(new Date('2026-10-15T12:00:00-03:00'));
    const situacoes = Object.fromEntries(lista.map((cupom) => [cupom.codigo, cupom.situacao]));
    expect(situacoes).toMatchObject({
      BEMVINDO10: 'valido',
      VALIDO: 'valido',
      INVALIDO: 'expirado',
      PAUSADO: 'inativo',
      ACABOU: 'esgotado',
    });
    expect(lista.find((cupom) => cupom.codigo === 'VALIDO')).toMatchObject({
      tipoDesconto: 'percentual',
      valor: 15,
      validoDe: '2026-01-01T00:00:00-03:00',
      validoAte: '2099-12-31T23:59:59-03:00',
      ativo: true,
    });

    cupons.delete('PAUSADO');
    cupons.delete('ACABOU');
  });

  it('a situação da lista é a mesma regra que o totem aplica', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'batata-frita', nome: 'Batata Frita', quantidade: 1 },
    });
    for (const cupom of await listarCupons()) {
      const aplicar = aplicarCupom({ pedidoId, codigo: cupom.codigo });
      if (cupom.situacao === 'valido') {
        await expect(aplicar).resolves.toMatchObject({ cupom: { codigo: cupom.codigo } });
      } else {
        await expect(aplicar).rejects.toMatchObject({ statusCode: 400 });
      }
    }
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

describe('clientes de fidelidade', () => {
  it('cadastra por CPF válido, ajusta os pontos e remove', async () => {
    const cliente = await cadastrarCliente({ cpf: '529.982.247-25', pontos: 40 });
    expect(cliente.numeroFidelidade).toBe('52998224725');

    await expect(cadastrarCliente({ cpf: '52998224725', pontos: 0 })).rejects.toMatchObject({
      statusCode: 409,
    });
    // Depois do cadastro, o cliente é identificado pelo id (o CPF não vai em URL).
    expect((await atualizarPontosCliente(cliente.id, { pontos: 90 })).pontos).toBe(90);

    await removerCliente(cliente.id);
    expect(clientesFidelidade.has('52998224725')).toBe(false);
    await expect(removerCliente(cliente.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('recusa CPF inválido e pontos negativos', async () => {
    await expect(cadastrarCliente({ cpf: '12345678900', pontos: 0 })).rejects.toThrow('CPF inválido');
    await expect(cadastrarCliente({ cpf: '11144477735', pontos: -1 })).rejects.toThrow(/Pontos/);
  });
});

describe('pedidos aguardando retirada', () => {
  it('lista o pedido pago e libera o número quando o balcão dá o ok', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'batata-frita', nome: 'Batata Frita', quantidade: 2 },
    });
    expect(await listarPedidosAguardando()).toEqual([]);

    await escolherFormaPagamento({ pedidoId, formaPagamento: 'dinheiro' }, new MockPagamentoGateway());
    const { numero } = await obterCarrinho(pedidoId);
    expect(await listarPedidosAguardando()).toMatchObject([
      { id: pedidoId, numero, itens: [{ nome: 'Batata Frita', quantidade: 2 }] },
    ]);

    await confirmarEntrega(pedidoId);
    expect(await listarPedidosAguardando()).toEqual([]);
    await expect(confirmarEntrega(pedidoId)).rejects.toMatchObject({ statusCode: 404 });
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
    expect(() => interpretarImagem(`data:image/svg+xml;base64,${png}`)).toThrow(/PNG, JPEG ou WebP/);
    expect(() => interpretarImagem('nao-e-imagem')).toThrow(/PNG, JPEG ou WebP/);
    expect(() => interpretarImagem(undefined)).toThrow(/PNG, JPEG ou WebP/);

    const grande = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64');
    expect(() => interpretarImagem(`data:image/png;base64,${grande}`)).toThrow(/muito grande/);
  });
});
