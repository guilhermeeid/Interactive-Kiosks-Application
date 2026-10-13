import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { registrosConsentimento } from '../../db/memory-store';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import {
  informarCpfNota,
  informarFidelidade,
  pularIdentificacao,
  usarPontos,
} from '../identificacao/identificacao.service';
import { registrarConsentimentos } from './consentimento.service';
import { obterTermo, VERSAO_TERMO } from './termo';

const CPF_CADASTRADO = '12345678909';

const registrosDoPedido = (pedidoId: string) =>
  registrosConsentimento.filter((registro) => registro.pedidoId === pedidoId);

// US 29
describe('termo de consentimento', () => {
  it('traz a versão e um texto para cada finalidade', () => {
    const termo = obterTermo();
    expect(termo.versao).toBe(VERSAO_TERMO);
    expect(termo.aviso).toMatch(/Nada é obrigatório/);
    expect(Object.keys(termo.finalidades).sort()).toEqual(['comprovante', 'cpf_nota', 'fidelidade']);
  });
});

describe('registrarConsentimentos', () => {
  it('registra na auditoria data, hora, versão do termo e finalidade de cada decisão', async () => {
    const pedidoId = randomUUID();
    const antes = Date.now();
    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { cpf_nota: true, fidelidade: false },
    });

    const registros = registrosDoPedido(pedidoId);
    expect(registros).toHaveLength(2);
    expect(registros.map(({ finalidade, aceito }) => [finalidade, aceito])).toEqual([
      ['cpf_nota', true],
      ['fidelidade', false],
    ]);
    for (const registro of registros) {
      expect(registro.versaoTermo).toBe(VERSAO_TERMO);
      // ISO 8601 completo: carrega a data e a hora da decisão.
      expect(registro.registradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(registro.registradoEm).getTime()).toBeGreaterThanOrEqual(antes);
    }
  });

  it('não guarda o dado pessoal na auditoria, só a decisão', async () => {
    const pedidoId = randomUUID();
    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { cpf_nota: true },
    });
    await informarCpfNota({ pedidoId, cpf: CPF_CADASTRADO });

    expect(JSON.stringify(registrosDoPedido(pedidoId))).not.toContain(CPF_CADASTRADO);
  });

  it('deixa no pedido a última decisão de cada finalidade', async () => {
    const pedidoId = randomUUID();
    const pedido = await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { cpf_nota: true, fidelidade: true },
    });
    expect(pedido.consentimentos).toEqual({ cpf_nota: true, fidelidade: true });
  });

  it('só registra quando a decisão muda, sem repetir linhas', async () => {
    const pedidoId = randomUUID();
    const decisoes = { cpf_nota: true } as const;
    await registrarConsentimentos({ pedidoId, versaoTermo: VERSAO_TERMO, decisoes });
    await registrarConsentimentos({ pedidoId, versaoTermo: VERSAO_TERMO, decisoes });
    expect(registrosDoPedido(pedidoId)).toHaveLength(1);

    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { cpf_nota: false },
    });
    expect(registrosDoPedido(pedidoId).map((registro) => registro.aceito)).toEqual([true, false]);
  });

  it('recusa versão de termo diferente da vigente e decisões malformadas', async () => {
    const pedidoId = randomUUID();
    await expect(
      registrarConsentimentos({ pedidoId, versaoTermo: '0.9', decisoes: { cpf_nota: true } }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      registrarConsentimentos({ pedidoId, versaoTermo: VERSAO_TERMO, decisoes: {} }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      registrarConsentimentos({
        pedidoId,
        versaoTermo: VERSAO_TERMO,
        decisoes: { marketing: true } as never,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(registrosDoPedido(pedidoId)).toEqual([]);
  });
});

describe('sem consentimento, o dado pessoal não é guardado', () => {
  it('recusa CPF na nota e fidelidade enquanto a finalidade não foi aceita', async () => {
    const pedidoId = randomUUID();
    await expect(informarCpfNota({ pedidoId, cpf: CPF_CADASTRADO })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      informarFidelidade({ pedidoId, numeroFidelidade: CPF_CADASTRADO }),
    ).rejects.toMatchObject({ statusCode: 403 });

    const pedido = await obterCarrinho(pedidoId);
    expect(pedido.cpfNaNota).toBeUndefined();
    expect(pedido.clienteId).toBeUndefined();
  });

  it('consentir numa finalidade não libera a outra', async () => {
    const pedidoId = randomUUID();
    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { cpf_nota: true, fidelidade: false },
    });

    expect((await informarCpfNota({ pedidoId, cpf: CPF_CADASTRADO })).cpfNaNota).toBe(CPF_CADASTRADO);
    await expect(
      informarFidelidade({ pedidoId, numeroFidelidade: CPF_CADASTRADO }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('voltar atrás no consentimento tira do pedido o dado daquela finalidade', async () => {
    const pedidoId = randomUUID();
    await adicionarItem({
      pedidoId,
      item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
    });
    await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { cpf_nota: true, fidelidade: true },
    });
    await informarCpfNota({ pedidoId, cpf: CPF_CADASTRADO });
    await informarFidelidade({ pedidoId, numeroFidelidade: CPF_CADASTRADO });
    await usarPontos({ pedidoId, pontos: 300 });

    // Recusa só a fidelidade: o CPF continua na nota, mas o vínculo e os pontos saem.
    let pedido = await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { fidelidade: false },
    });
    expect(pedido.cpfNaNota).toBe(CPF_CADASTRADO);
    expect(pedido.clienteId).toBeUndefined();
    expect(pedido.valorAPagarCentavos).toBe(1890);

    pedido = await registrarConsentimentos({
      pedidoId,
      versaoTermo: VERSAO_TERMO,
      decisoes: { cpf_nota: false },
    });
    expect(pedido.cpfNaNota).toBeUndefined();
  });
});

// US 10
describe('depois de pular a identificação', () => {
  it('a API não aceita mais consentimento nem dados pessoais para o pedido', async () => {
    const pedidoId = randomUUID();
    await pularIdentificacao({ pedidoId, versaoTermo: VERSAO_TERMO });

    await expect(
      registrarConsentimentos({ pedidoId, versaoTermo: VERSAO_TERMO, decisoes: { cpf_nota: true } }),
    ).rejects.toMatchObject({ statusCode: 409, message: 'Este pedido segue sem dados pessoais' });
    await expect(
      registrarConsentimentos({
        pedidoId,
        versaoTermo: VERSAO_TERMO,
        decisoes: { comprovante: true },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(informarCpfNota({ pedidoId, cpf: CPF_CADASTRADO })).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
