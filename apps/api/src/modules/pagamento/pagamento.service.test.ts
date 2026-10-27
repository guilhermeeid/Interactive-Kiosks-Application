import { randomUUID } from 'node:crypto';
import type { ConsumoPedido, FormaPagamento, ItemCardapio } from '@totem/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { criarConfigPadrao } from '../../db/config-padrao';
import { clientesFidelidade, config, cupons, itensCardapio } from '../../db/memory-store';
import { MockPagamentoGateway } from '../../integrations/gateway-pagamento';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { registrarConsentimentos } from '../consentimento/consentimento.service';
import { VERSAO_TERMO } from '../consentimento/termo';
import { aplicarCupom } from '../cupom/cupom.service';
import { informarFidelidade, usarPontos } from '../identificacao/identificacao.service';
import { cancelarNoCaixa, escolherFormaPagamento, receberNoCaixa } from './pagamento.service';

const gateway = new MockPagamentoGateway();

const pagar = (
  pedidoId: string,
  formaPagamento: FormaPagamento = 'pix',
  // null = o cliente não escolheu ("undefined" cairia no valor padrão do parâmetro)
  consumo: ConsumoPedido | null = 'local',
) => escolherFormaPagamento({ pedidoId, formaPagamento, consumo: consumo ?? undefined }, gateway);

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

async function pedidoCom(itemCardapioId = 'lanche-classico', quantidade = 1): Promise<string> {
  const pedidoId = randomUUID();
  await adicionarItem({ pedidoId, item: { itemCardapioId, nome: 'x', quantidade } });
  return pedidoId;
}
const pedidoComLanche = (quantidade = 1) => pedidoCom('lanche-classico', quantidade);

function criarItem(dados: Partial<ItemCardapio>): ItemCardapio {
  const item: ItemCardapio = {
    id: `item-${randomUUID()}`,
    nome: 'Torta do dia',
    descricao: '',
    categoria: 'sobremesas',
    precoCentavos: 1200,
    disponivel: true,
    ...dados,
  };
  itensCardapio.push(item);
  return item;
}

afterEach(() => {
  Object.assign(config, criarConfigPadrao());
});

describe('escolherFormaPagamento', () => {
  it('cobra o valor com desconto do cupom aplicado e marca o pedido como pago', async () => {
    const pedidoId = await pedidoComLanche();
    await aplicarCupom({ pedidoId, codigo: 'BEMVINDO10' });

    const resultado = await pagar(pedidoId);

    expect(resultado.status).toBe('autorizado');
    expect(resultado.valorCentavos).toBe(1890 - Math.round(1890 * 0.1));
    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.status).toBe('pago');
    expect(pedido.formaPagamento).toBe('pix');
  });

  it('dá ao pedido pago um número de três dígitos', async () => {
    const pedidoId = await pedidoComLanche();
    await pagar(pedidoId, 'credito');
    expect((await obterCarrinho(pedidoId)).numero).toMatch(/^[1-9]\d{2}$/);
  });

  it('recusa carrinho vazio e pedido que já foi pago', async () => {
    await expect(pagar(randomUUID())).rejects.toMatchObject({
      statusCode: 400,
      message: 'O carrinho está vazio',
    });

    const pedidoId = await pedidoComLanche();
    await pagar(pedidoId);
    await expect(pagar(pedidoId)).rejects.toMatchObject({ statusCode: 409 });
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

    await pagar(primeiro);
    expect(cupons.get('UMAVEZ')?.usos).toBe(1);

    // O segundo pedido aplicou o cupom antes de ele esgotar: perde o desconto e é avisado.
    await expect(pagar(segundo)).rejects.toMatchObject({ statusCode: 409 });
    const pedido = await obterCarrinho(segundo);
    expect(pedido.status).toBe('em_montagem');
    expect(pedido.cupomAplicado).toBeUndefined();
    expect(pedido.valorAPagarCentavos).toBe(1890);
  });
});

// Item 11
describe('para comer aqui ou para levar', () => {
  it('é obrigatório escolher quando a loja oferece os dois, e fica no pedido', async () => {
    const pedidoId = await pedidoComLanche();
    await expect(pagar(pedidoId, 'pix', null)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Escolha se o pedido é para comer aqui ou para levar',
    });
    expect((await obterCarrinho(pedidoId)).status).toBe('em_montagem');

    await pagar(pedidoId, 'pix', 'viagem');
    expect((await obterCarrinho(pedidoId)).consumo).toBe('viagem');
  });

  it('com uma opção desligada, a outra vale sozinha', async () => {
    config.consumo = { local: false, viagem: true }; // só drive / para levar
    const pedidoId = await pedidoComLanche();
    await pagar(pedidoId, 'pix', null);
    expect((await obterCarrinho(pedidoId)).consumo).toBe('viagem');

    config.consumo = { local: true, viagem: false }; // sem embalagem para viagem
    const outro = await pedidoComLanche();
    await pagar(outro, 'pix', 'viagem');
    expect((await obterCarrinho(outro)).consumo).toBe('local');
  });
});

// Itens 1 e 9
describe('formas de pagamento definidas pelo administrador', () => {
  it('recusa qualquer forma desligada, inclusive dinheiro', async () => {
    config.formasPagamento = {
      credito: false,
      debito: false,
      pix: true,
      vale_refeicao: false,
      vale_alimentacao: false,
      dinheiro: false,
    };
    const pedidoId = await pedidoComLanche();
    for (const forma of ['credito', 'debito', 'vale_refeicao', 'vale_alimentacao', 'dinheiro'] as const) {
      await expect(pagar(pedidoId, forma)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Forma de pagamento indisponível',
      });
    }
    expect((await pagar(pedidoId, 'pix')).status).toBe('autorizado');
  });

  it('aceita vale-refeição e vale-alimentação como formas próprias', async () => {
    config.formasPagamento.vale_alimentacao = true;
    for (const forma of ['vale_refeicao', 'vale_alimentacao'] as const) {
      const pedidoId = await pedidoComLanche();
      const resultado = await pagar(pedidoId, forma);
      expect(resultado).toMatchObject({ status: 'autorizado', formaPagamento: forma });
      expect((await obterCarrinho(pedidoId)).formaPagamento).toBe(forma);
    }
  });
});

// Item 2: dinheiro é pago no caixa, com atendente.
describe('pagamento em dinheiro', () => {
  it('não passa pelo gateway: o pedido fica aguardando o caixa, com número', async () => {
    const pedidoId = await pedidoComLanche();
    const resultado = await pagar(pedidoId, 'dinheiro');

    expect(resultado).toMatchObject({ status: 'pendente', formaPagamento: 'dinheiro', valorCentavos: 1890 });
    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.status).toBe('aguardando_pagamento');
    expect(pedido.numero).toMatch(/^[1-9]\d{2}$/);
  });

  it('reserva o estoque no totem e credita os pontos só quando o caixa recebe', async () => {
    const torta = criarItem({ estoque: 3 });
    const cpf = '52998224725';
    cadastrarCliente(cpf, 100);
    const pedidoId = await pedidoCom(torta.id, 2);
    await identificar(pedidoId, cpf);

    await pagar(pedidoId, 'dinheiro');
    expect(torta.estoque).toBe(1);
    // 5% de R$ 24,00 = R$ 1,20 = 120 pontos, ainda não creditados.
    expect((await obterCarrinho(pedidoId)).pontosPrevistos).toBe(120);
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(100);

    const pedido = await receberNoCaixa(pedidoId);
    expect(pedido.status).toBe('pago');
    expect(pedido.pontosAcumulados).toBe(120);
    expect(pedido.pontosPrevistos).toBeUndefined();
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(220);
  });

  it('cancelar no caixa devolve estoque, uso do cupom, pontos e o número', async () => {
    const torta = criarItem({ estoque: 5 });
    cupons.set('CAIXA1', { codigo: 'CAIXA1', tipoDesconto: 'valor_fixo', valor: 100, limiteUsos: 1, usos: 0, ativo: true });
    const cpf = '39053344705';
    cadastrarCliente(cpf, 500);
    const pedidoId = await pedidoCom(torta.id, 2);
    await identificar(pedidoId, cpf);
    await aplicarCupom({ pedidoId, codigo: 'CAIXA1' });
    await usarPontos({ pedidoId, pontos: 300 });

    await pagar(pedidoId, 'dinheiro');
    expect(torta.estoque).toBe(3);
    expect(cupons.get('CAIXA1')?.usos).toBe(1);
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(200);

    const pedido = await cancelarNoCaixa(pedidoId);
    expect(pedido.status).toBe('cancelado');
    expect(torta.estoque).toBe(5);
    expect(cupons.get('CAIXA1')?.usos).toBe(0);
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(500);
  });

  it('só recebe ou cancela pedido que está aguardando o caixa', async () => {
    const pago = await pedidoComLanche();
    await pagar(pago, 'pix');
    await expect(receberNoCaixa(pago)).rejects.toMatchObject({ statusCode: 404 });
    await expect(cancelarNoCaixa(pago)).rejects.toMatchObject({ statusCode: 404 });

    const noCaixa = await pedidoComLanche();
    await pagar(noCaixa, 'dinheiro');
    await receberNoCaixa(noCaixa);
    await expect(receberNoCaixa(noCaixa)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('estoque', () => {
  it('baixa o estoque no pagamento e o item esgota quando as unidades acabam', async () => {
    const item = criarItem({ estoque: 2 });
    const pedidoId = await pedidoCom(item.id, 2);
    expect(item.estoque).toBe(2);

    await pagar(pedidoId);
    expect(item.estoque).toBe(0);
    await expect(pedidoCom(item.id)).rejects.toThrow('Item indisponível no momento');
  });

  it('recusa o pagamento quando as últimas unidades foram vendidas a outro pedido', async () => {
    const item = criarItem({ estoque: 1 });
    const primeiro = await pedidoCom(item.id);
    const segundo = await pedidoCom(item.id);

    await pagar(primeiro);
    await expect(pagar(segundo)).rejects.toMatchObject({ statusCode: 409 });
    expect((await obterCarrinho(segundo)).status).toBe('em_montagem');
  });

  // Item 13
  it('combo pago baixa o estoque dos itens que o compõem', async () => {
    const pao = criarItem({ nome: 'Pão de queijo', estoque: 10 });
    const cafe = criarItem({ nome: 'Café', estoque: 4 });
    const combo = criarItem({
      nome: 'Café da manhã',
      componentes: [
        { itemCardapioId: pao.id, quantidade: 3 },
        { itemCardapioId: cafe.id, quantidade: 1 },
      ],
    });
    const pedidoId = await pedidoCom(combo.id, 2);
    await pagar(pedidoId);
    expect(pao.estoque).toBe(4);
    expect(cafe.estoque).toBe(2);
  });
});

describe('pontos de fidelidade no pagamento', () => {
  it('debita os pontos usados e credita os acumulados sobre o valor pago', async () => {
    const cpf = '11144477735';
    cadastrarCliente(cpf, 1000);
    const pedidoId = await pedidoComLanche(2); // R$ 37,80
    await identificar(pedidoId, cpf);
    await usarPontos({ pedidoId, pontos: 780 }); // − R$ 7,80

    const resultado = await pagar(pedidoId, 'debito');
    expect(resultado.valorCentavos).toBe(3000);

    // 5% de R$ 30,00 = R$ 1,50 = 150 pontos (100 pontos por real).
    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.pontosAcumulados).toBe(150);
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(1000 - 780 + 150);
  });

  it('segue o percentual e a equivalência definidos pelo administrador', async () => {
    const cpf = '86288366757';
    cadastrarCliente(cpf, 0);
    config.fidelidade.percentualAcumulo = 10;
    config.fidelidade.pontosPorReal = 10;
    const pedidoId = await pedidoComLanche(); // R$ 18,90
    await identificar(pedidoId, cpf);

    await pagar(pedidoId);
    // 10% de R$ 18,90 = R$ 1,89 → 18 pontos (10 pontos por real, arredondado para baixo).
    expect((await obterCarrinho(pedidoId)).pontosAcumulados).toBe(18);
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(18);
  });

  it('não acumula com o acúmulo desligado nem em pedido sem cliente identificado', async () => {
    const cpf = '71428793860';
    cadastrarCliente(cpf, 200);
    config.fidelidade.acumuloHabilitado = false;
    const comCliente = await pedidoComLanche();
    await identificar(comCliente, cpf);
    await pagar(comCliente);
    expect((await obterCarrinho(comCliente)).pontosAcumulados).toBe(0);
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(200);

    config.fidelidade.acumuloHabilitado = true;
    const semCliente = await pedidoComLanche();
    await pagar(semCliente);
    expect((await obterCarrinho(semCliente)).pontosAcumulados).toBeUndefined();
  });

  it('pedido com cupom não acumula quando pontos e cupom não somam', async () => {
    const cpf = '41325758027';
    cadastrarCliente(cpf, 0);
    config.fidelidade.combinaComCupom = false;
    const pedidoId = await pedidoComLanche();
    await identificar(pedidoId, cpf);
    await aplicarCupom({ pedidoId, codigo: 'DESC5' });

    await pagar(pedidoId);
    expect((await obterCarrinho(pedidoId)).pontosAcumulados).toBe(0);
    expect(clientesFidelidade.get(cpf)?.pontos).toBe(0);
  });
});
