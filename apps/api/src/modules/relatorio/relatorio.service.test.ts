import { randomUUID } from 'node:crypto';
import type { FormaPagamento, ItemVendido, Venda } from '@totem/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { cupons, pedidos, vendas } from '../../db/memory-store';
import { MockPagamentoGateway } from '../../integrations/gateway-pagamento';
import { adicionarItem } from '../carrinho/carrinho.service';
import { aplicarCupom } from '../cupom/cupom.service';
import {
  cancelarNoCaixa,
  escolherFormaPagamento,
  receberNoCaixa,
} from '../pagamento/pagamento.service';
import { gerarRelatorioVendas } from './relatorio.service';

beforeEach(() => {
  vendas.length = 0;
});

async function pedidoCom(itens: [string, string, number][]): Promise<string> {
  const pedidoId = randomUUID();
  for (const [itemCardapioId, nome, quantidade] of itens) {
    await adicionarItem({ pedidoId, item: { itemCardapioId, nome, quantidade } });
  }
  return pedidoId;
}

const pagar = (pedidoId: string, formaPagamento: FormaPagamento) =>
  escolherFormaPagamento(
    { pedidoId, formaPagamento, consumo: 'local' },
    new MockPagamentoGateway(),
  );

// Venda montada à mão, com data e valores escolhidos pelo teste.
function venda(
  pagaEm: string,
  itens: Partial<ItemVendido>[],
  formaPagamento: FormaPagamento = 'pix',
  consumo: Venda['consumo'] = 'local',
): Venda {
  return {
    pedidoId: randomUUID(),
    numero: '100',
    pagaEm,
    formaPagamento,
    consumo,
    itens: itens.map((item) => ({
      itemCardapioId: 'lanche-classico',
      nome: 'Lanche Clássico',
      categoria: 'lanches',
      categoriaNome: 'Lanches',
      quantidade: 1,
      valorCentavos: 1890,
      descontoCentavos: 0,
      ...item,
    })),
  };
}

const batata = {
  itemCardapioId: 'batata-frita',
  nome: 'Batata Frita',
  categoria: 'acompanhamentos',
  categoriaNome: 'Acompanhamentos',
  valorCentavos: 990,
};

describe('registro da venda', () => {
  it('entra no histórico quando o pagamento é aprovado, sem dado pessoal', async () => {
    const pedidoId = await pedidoCom([
      ['lanche-classico', 'Lanche Clássico', 2],
      ['batata-frita', 'Batata Frita', 1],
    ]);
    await aplicarCupom({ pedidoId, codigo: 'DESC5' });
    await pagar(pedidoId, 'credito');

    expect(vendas).toHaveLength(1);
    const [registro] = vendas;
    expect(registro).toMatchObject({
      pedidoId,
      formaPagamento: 'credito',
      consumo: 'local',
      cupom: 'DESC5',
    });
    expect(Object.keys(registro).sort()).toEqual(
      ['consumo', 'cupom', 'formaPagamento', 'itens', 'numero', 'pagaEm', 'pedidoId'].sort(),
    );
    // O desconto rateado entre as linhas soma o que o cliente deixou de pagar.
    const pago = registro.itens.reduce((t, l) => t + l.valorCentavos - l.descontoCentavos, 0);
    expect(pago).toBe(pedidos.get(pedidoId)?.valorAPagarCentavos);
    expect(registro.itens.map((l) => l.categoriaNome)).toEqual(['Lanches', 'Acompanhamentos']);
  });

  it('em dinheiro, só entra quando o caixa recebe; cancelado no caixa não entra', async () => {
    const recebido = await pedidoCom([['batata-frita', 'Batata Frita', 1]]);
    await pagar(recebido, 'dinheiro');
    expect(vendas).toHaveLength(0);
    await receberNoCaixa(recebido);
    expect(vendas).toHaveLength(1);

    const cancelado = await pedidoCom([['batata-frita', 'Batata Frita', 1]]);
    await pagar(cancelado, 'dinheiro');
    await cancelarNoCaixa(cancelado);
    expect(vendas).toHaveLength(1);
  });

  it('o desconto do cupom cai só nos itens que o cupom alcança', async () => {
    cupons.set('SOLANCHE', {
      codigo: 'SOLANCHE',
      tipoDesconto: 'valor_fixo',
      valor: 500,
      aplicaEm: { tipo: 'categorias', ids: ['lanches'] },
      ativo: true,
    });
    try {
      const pedidoId = await pedidoCom([
        ['lanche-classico', 'Lanche Clássico', 1],
        ['batata-frita', 'Batata Frita', 1],
      ]);
      await aplicarCupom({ pedidoId, codigo: 'SOLANCHE' });
      await pagar(pedidoId, 'credito');
      expect(vendas[0].itens.map((l) => l.descontoCentavos)).toEqual([500, 0]);
    } finally {
      cupons.delete('SOLANCHE');
    }
  });
});

describe('gerarRelatorioVendas', () => {
  it('soma faturamento, pedidos, ticket médio e o ranking dos mais vendidos', async () => {
    vendas.push(
      venda('2026-11-02T15:00:00Z', [
        { quantidade: 2, valorCentavos: 3780, descontoCentavos: 380 },
        batata,
      ]),
      venda(
        '2026-11-03T15:00:00Z',
        [{ ...batata, quantidade: 3, valorCentavos: 2970 }],
        'dinheiro',
        'viagem',
      ),
    );
    const relatorio = await gerarRelatorioVendas({ de: '2026-11-01', ate: '2026-11-07' });

    expect(relatorio.resumo).toEqual({
      faturamentoCentavos: 3780 - 380 + 990 + 2970,
      valorBrutoCentavos: 3780 + 990 + 2970,
      descontosCentavos: 380,
      pedidos: 2,
      itensVendidos: 6,
      ticketMedioCentavos: Math.round((3780 - 380 + 990 + 2970) / 2),
    });
    // Mais vendidos = mais unidades.
    expect(relatorio.maisVendidos.map((p) => [p.nome, p.quantidade])).toEqual([
      ['Batata Frita', 4],
      ['Lanche Clássico', 2],
    ]);
    expect(relatorio.porCategoria.map((c) => [c.nome, c.faturamentoCentavos])).toEqual([
      ['Acompanhamentos', 3960],
      ['Lanches', 3400],
    ]);
    expect(relatorio.porFormaPagamento).toEqual([
      { formaPagamento: 'pix', pedidos: 1, faturamentoCentavos: 4390 },
      { formaPagamento: 'dinheiro', pedidos: 1, faturamentoCentavos: 2970 },
    ]);
    expect(relatorio.porConsumo.map((c) => c.consumo)).toEqual(['local', 'viagem']);
  });

  it('conta os dias e as horas no fuso da loja e escolhe o agrupamento pelo período', async () => {
    // 02:30 em UTC do dia 9 ainda é 23:30 do dia 8 em São Paulo.
    vendas.push(venda('2026-11-09T02:30:00Z', [{}]));

    const umDia = await gerarRelatorioVendas({ de: '2026-11-08', ate: '2026-11-08' });
    expect(umDia.agrupamento).toBe('hora');
    expect(umDia.serie).toHaveLength(24);
    expect(umDia.serie.find((p) => p.faturamentoCentavos > 0)?.chave).toBe('2026-11-08T23');
    expect(
      (await gerarRelatorioVendas({ de: '2026-11-09', ate: '2026-11-09' })).resumo.pedidos,
    ).toBe(0);

    const mes = await gerarRelatorioVendas({ de: '2026-11-01', ate: '2026-11-30' });
    expect(mes.agrupamento).toBe('dia');
    expect(mes.serie).toHaveLength(30);
    expect(mes.serie.find((p) => p.pedidos === 1)?.chave).toBe('2026-11-08');

    const ano = await gerarRelatorioVendas({ de: '2026-01-01', ate: '2026-12-31' });
    expect(ano.agrupamento).toBe('mes');
    expect(ano.serie.map((p) => p.chave)).toHaveLength(12);
    expect(ano.serie.find((p) => p.pedidos === 1)?.chave).toBe('2026-11');
  });

  it('filtra por categoria, forma de pagamento e consumo', async () => {
    vendas.push(
      venda('2026-11-02T15:00:00Z', [{}, batata], 'pix', 'local'),
      venda('2026-11-02T16:00:00Z', [batata], 'dinheiro', 'viagem'),
    );
    const periodo = { de: '2026-11-01', ate: '2026-11-30' };

    const lanches = await gerarRelatorioVendas({ ...periodo, categoria: 'lanches' });
    expect(lanches.resumo).toMatchObject({
      pedidos: 1,
      faturamentoCentavos: 1890,
      itensVendidos: 1,
    });
    expect(lanches.categorias.map((c) => c.id)).toEqual(['acompanhamentos', 'lanches']);

    const dinheiro = await gerarRelatorioVendas({ ...periodo, formaPagamento: 'dinheiro' });
    expect(dinheiro.resumo).toMatchObject({ pedidos: 1, faturamentoCentavos: 990 });

    const local = await gerarRelatorioVendas({ ...periodo, consumo: 'local' });
    expect(local.resumo).toMatchObject({ pedidos: 1, faturamentoCentavos: 1890 + 990 });
  });

  it('sem vendas no período devolve tudo zerado; "todo o período" sem vendas não tem série', async () => {
    const vazio = await gerarRelatorioVendas({});
    expect(vazio).toMatchObject({
      de: null,
      ate: null,
      serie: [],
      maisVendidos: [],
      totalDeVendas: 0,
    });

    vendas.push(venda('2026-10-02T15:00:00Z', [{}]));
    const novembro = await gerarRelatorioVendas({ de: '2026-11-01', ate: '2026-11-07' });
    expect(novembro.resumo).toMatchObject({
      pedidos: 0,
      faturamentoCentavos: 0,
      ticketMedioCentavos: 0,
    });
    expect(novembro.serie.every((p) => p.faturamentoCentavos === 0)).toBe(true);
    expect(novembro.totalDeVendas).toBe(1);

    // Sem fim, o período vai até hoje.
    const desdeOutubro = await gerarRelatorioVendas(
      { de: '2026-10-01' },
      new Date('2026-10-05T12:00:00Z'),
    );
    expect(desdeOutubro).toMatchObject({ de: '2026-10-01', ate: '2026-10-05' });
  });

  it('recusa período invertido, data inexistente e filtros desconhecidos', async () => {
    await expect(gerarRelatorioVendas({ de: '2026-11-10', ate: '2026-11-01' })).rejects.toThrow(
      /início do período/,
    );
    await expect(gerarRelatorioVendas({ de: '2026-02-30' })).rejects.toThrow(/Data inválida/);
    await expect(gerarRelatorioVendas({ formaPagamento: 'cheque' })).rejects.toThrow(/Forma/);
    await expect(gerarRelatorioVendas({ consumo: 'delivery' })).rejects.toThrow(/Consumo/);
  });
});
