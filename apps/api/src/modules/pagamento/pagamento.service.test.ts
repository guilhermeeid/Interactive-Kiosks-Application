import { randomUUID } from 'node:crypto';
import type { ItemCardapio } from '@totem/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { criarConfigPadrao } from '../../db/config-padrao';
import { clientesFidelidade, config, cupons, itensCardapio } from '../../db/memory-store';
import { MockPagamentoGateway } from '../../integrations/gateway-pagamento';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { registrarConsentimentos } from '../consentimento/consentimento.service';
import { VERSAO_TERMO } from '../consentimento/termo';
import { aplicarCupom } from '../cupom/cupom.service';
import { informarFidelidade, usarPontos } from '../identificacao/identificacao.service';
import { escolherFormaPagamento } from './pagamento.service';

const gateway = new MockPagamentoGateway();

// O cliente concorda com o uso do CPF na fidelidade (US 29) e é vinculado ao pedido.
async function identificar(pedidoId: string, cpf: string): Promise<void> {
  await registrarConsentimentos({
    pedidoId,
    versaoTermo: VERSAO_TERMO,
    decisoes: { fidelidade: true },
  });
  await informarFidelidade({ pedidoId, numeroFidelidade: cpf });
}

// Cada teste de fidelidade usa um cliente próprio, para o saldo de um não afetar o outro.
function cadastrarCliente(cpf: string, pontos: number): void {
  clientesFidelidade.set(cpf, { id: `cliente-${randomUUID()}`, numeroFidelidade: cpf, pontos });
}

async function pedidoComLanche(quantidade = 1): Promise<string> {
  const pedidoId = randomUUID();
  await adicionarItem({
    pedidoId,
    item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade },
  });
  return pedidoId;
}

afterEach(() => {
  Object.assign(config, criarConfigPadrao());
});

describe('escolherFormaPagamento', () => {
  it('cobra o valor com desconto do cupom aplicado e marca o pedido como pago', async () => {
    const pedidoId = await pedidoComLanche();
    await aplicarCupom({ pedidoId, codigo: 'BEMVINDO10' });

    const resultado = await escolherFormaPagamento({ pedidoId, formaPagamento: 'pix' }, gateway);

    expect(resultado.status).toBe('autorizado');
    expect(resultado.valorCentavos).toBe(1890 - Math.round(1890 * 0.1));

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.status).toBe('pago');
  });

  it('dá ao pedido pago um número de três dígitos', async () => {
    const pedidoId = await pedidoComLanche();
    await escolherFormaPagamento({ pedidoId, formaPagamento: 'dinheiro' }, gateway);
    expect((await obterCarrinho(pedidoId)).numero).toMatch(/^[1-9]\d{2}$/);
  });

  it('recusa carrinho vazio e pedido que já foi pago', async () => {
    await expect(
      escolherFormaPagamento({ pedidoId: randomUUID(), formaPagamento: 'pix' }, gateway),
    ).rejects.toMatchObject({ statusCode: 400, message: 'O carrinho está vazio' });

    const pedidoId = await pedidoComLanche();
    await escolherFormaPagamento({ pedidoId, formaPagamento: 'pix' }, gateway);
    await expect(
      escolherFormaPagamento({ pedidoId, formaPagamento: 'pix' }, gateway),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('conta o uso do cupom só quando o pagamento é aprovado', async () => {
    cupons.set('UMAVEZ', {
      codigo: 'UMAVEZ',
      tipoDesconto: 'valor_fixo',
      valor: 100,
      limiteUsos: 1,
      usos: 0,
      ativo: true,
    });
    const primeiro = await pedidoComLanche();
    const segundo = await pedidoComLanche();
    await aplicarCupom({ pedidoId: primeiro, codigo: 'UMAVEZ' });
    await aplicarCupom({ pedidoId: segundo, codigo: 'UMAVEZ' });
    expect(cupons.get('UMAVEZ')?.usos).toBe(0);

    await escolherFormaPagamento({ pedidoId: primeiro, formaPagamento: 'pix' }, gateway);
    expect(cupons.get('UMAVEZ')?.usos).toBe(1);

    // O segundo pedido aplicou o cupom antes de ele esgotar: perde o desconto e é avisado.
    await expect(
      escolherFormaPagamento({ pedidoId: segundo, formaPagamento: 'pix' }, gateway),
    ).rejects.toMatchObject({ statusCode: 409 });
    const pedido = await obterCarrinho(segundo);
    expect(pedido.status).toBe('em_montagem');
    expect(pedido.cupomAplicado).toBeUndefined();
    expect(pedido.valorAPagarCentavos).toBe(1890);
  });
});

describe('formas de pagamento definidas pelo administrador', () => {
  it('recusa a forma desabilitada, mas dinheiro é sempre aceito', async () => {
    config.formasPagamento = { credito: false, debito: false, pix: false };

    const pedidoId = await pedidoComLanche();
    for (const formaPagamento of ['credito', 'debito', 'pix'] as const) {
      await expect(
        escolherFormaPagamento({ pedidoId, formaPagamento }, gateway),
      ).rejects.toMatchObject({ statusCode: 400, message: 'Forma de pagamento indisponível' });
    }

    const resultado = await escolherFormaPagamento({ pedidoId, formaPagamento: 'dinheiro' }, gateway);
    expect(resultado.status).toBe('autorizado');
  });
});

describe('estoque', () => {
  function criarItemComEstoque(estoque: number): ItemCardapio {
    const item: ItemCardapio = {
      id: `item-${randomUUID()}`,
      nome: 'Torta do dia',
      descricao: '',
      categoria: 'sobremesas',
      precoCentavos: 1200,
      estoque,
      disponivel: true,
    };
    itensCardapio.push(item);
    return item;
  }

  it('baixa o estoque no pagamento e o item esgota quando as unidades acabam', async () => {
    const item = criarItemComEstoque(2);
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: item.id, nome: item.nome, quantidade: 2 },
    });
    expect(item.estoque).toBe(2);

    await escolherFormaPagamento({ pedidoId, formaPagamento: 'pix' }, gateway);
    expect(item.estoque).toBe(0);
    await expect(
      adicionarItem({
        pedidoId: randomUUID(),
        item: { itemCardapioId: item.id, nome: item.nome, quantidade: 1 },
      }),
    ).rejects.toThrow('Item indisponível no momento');
  });

  it('recusa o pagamento quando as últimas unidades foram vendidas a outro pedido', async () => {
    const item = criarItemComEstoque(1);
    const primeiro = randomUUID();
    const segundo = randomUUID();
    for (const pedidoId of [primeiro, segundo]) {
      await adicionarItem({
        pedidoId,
        item: { itemCardapioId: item.id, nome: item.nome, quantidade: 1 },
      });
    }

    await escolherFormaPagamento({ pedidoId: primeiro, formaPagamento: 'pix' }, gateway);
    await expect(
      escolherFormaPagamento({ pedidoId: segundo, formaPagamento: 'pix' }, gateway),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await obterCarrinho(segundo)).status).toBe('em_montagem');
  });
});

describe('pontos de fidelidade no pagamento', () => {
  it('debita os pontos usados e credita os acumulados sobre o valor pago', async () => {
    const cpf = '11144477735';
    cadastrarCliente(cpf, 1000);
    const pedidoId = await pedidoComLanche(2); // R$ 37,80
    await identificar(pedidoId, cpf);
    await usarPontos({ pedidoId, pontos: 780 }); // − R$ 7,80

    const resultado = await escolherFormaPagamento({ pedidoId, formaPagamento: 'debito' }, gateway);
    expect(resultado.valorCentavos).toBe(3000);

    // 5% de R$ 30,00 = R$ 1,50 = 150 pontos (100 pontos por real).
    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.pontosAcumulados).toBe(150);
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(1000 - 780 + 150);
  });

  it('segue o percentual e a equivalência definidos pelo administrador', async () => {
    const cpf = '52998224725';
    cadastrarCliente(cpf, 0);
    config.fidelidade.percentualAcumulo = 10;
    config.fidelidade.pontosPorReal = 10;
    const pedidoId = await pedidoComLanche(); // R$ 18,90
    await identificar(pedidoId, cpf);

    await escolherFormaPagamento({ pedidoId, formaPagamento: 'pix' }, gateway);
    // 10% de R$ 18,90 = R$ 1,89 → 18 pontos (10 pontos por real, arredondado para baixo).
    expect((await obterCarrinho(pedidoId)).pontosAcumulados).toBe(18);
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(18);
  });

  it('não acumula com o acúmulo desligado nem em pedido sem cliente identificado', async () => {
    const cpf = '39053344705';
    cadastrarCliente(cpf, 200);
    config.fidelidade.acumuloHabilitado = false;
    const comCliente = await pedidoComLanche();
    await identificar(comCliente, cpf);
    await escolherFormaPagamento({ pedidoId: comCliente, formaPagamento: 'pix' }, gateway);
    expect((await obterCarrinho(comCliente)).pontosAcumulados).toBe(0);
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(200);

    config.fidelidade.acumuloHabilitado = true;
    const semCliente = await pedidoComLanche();
    await escolherFormaPagamento({ pedidoId: semCliente, formaPagamento: 'pix' }, gateway);
    expect((await obterCarrinho(semCliente)).pontosAcumulados).toBeUndefined();
  });

  it('pedido com cupom não acumula quando pontos e cupom não somam', async () => {
    const cpf = '86288366757';
    cadastrarCliente(cpf, 0);
    config.fidelidade.combinaComCupom = false;
    const pedidoId = await pedidoComLanche();
    await identificar(pedidoId, cpf);
    await aplicarCupom({ pedidoId, codigo: 'DESC5' });

    await escolherFormaPagamento({ pedidoId, formaPagamento: 'pix' }, gateway);
    expect((await obterCarrinho(pedidoId)).pontosAcumulados).toBe(0);
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(0);
  });
});
