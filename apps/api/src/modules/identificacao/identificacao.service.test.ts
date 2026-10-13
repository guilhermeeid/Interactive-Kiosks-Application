import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { criarConfigPadrao } from '../../db/config-padrao';
import { clientesFidelidade, config, registrosConsentimento } from '../../db/memory-store';
import { HttpError } from '../../errors';
import { adicionarItem, obterCarrinho } from '../carrinho/carrinho.service';
import { registrarConsentimentos } from '../consentimento/consentimento.service';
import type { RegistrarConsentimentosBody } from '../consentimento/consentimento.types';
import { VERSAO_TERMO } from '../consentimento/termo';
import { aplicarCupom } from '../cupom/cupom.service';
import {
  consultarCpf,
  consultarFidelidade,
  informarCpfNota,
  informarFidelidade,
  pularIdentificacao,
  usarPontos,
} from './identificacao.service';

const CPF_CADASTRADO = '12345678909'; // cliente de demonstração, 1.250 pontos
const CPF_SEM_CADASTRO = '11144477735';

afterEach(() => {
  Object.assign(config, criarConfigPadrao());
});

// O cliente marca as finalidades no termo antes de informar o CPF (US 29).
const consentir = (
  pedidoId: string,
  decisoes: RegistrarConsentimentosBody['decisoes'] = { cpf_nota: true, fidelidade: true },
) => registrarConsentimentos({ pedidoId, versaoTermo: VERSAO_TERMO, decisoes });

async function pedidoComLanche(): Promise<string> {
  const pedidoId = randomUUID();
  await adicionarItem({
    pedidoId,
    item: { itemCardapioId: 'lanche-classico', nome: 'Lanche Clássico', quantidade: 1 },
  });
  await consentir(pedidoId);
  return pedidoId;
}

describe('consultarFidelidade', () => {
  it('retorna o saldo do cliente cadastrado, aceitando o CPF com máscara', async () => {
    expect((await consultarFidelidade(CPF_CADASTRADO)).pontos).toBe(1250);
    expect((await consultarFidelidade('123.456.789-09')).pontos).toBe(1250);
  });

  it('responde 404 para CPF válido sem cadastro, sem criar cliente novo', async () => {
    const antes = clientesFidelidade.size;
    await expect(consultarFidelidade(CPF_SEM_CADASTRO)).rejects.toMatchObject({
      statusCode: 404,
      message: 'CPF sem cadastro no programa de fidelidade',
    });
    expect(clientesFidelidade.size).toBe(antes);
  });

  it('responde 400 para CPF com dígito verificador errado', async () => {
    await expect(consultarFidelidade('12345678900')).rejects.toMatchObject({
      statusCode: 400,
      message: 'CPF inválido',
    });
  });

  it('trata todo CPF como sem cadastro quando o programa está desligado', async () => {
    config.fidelidade.habilitado = false;
    await expect(consultarFidelidade(CPF_CADASTRADO)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// US 09: conferência do CPF assim que é digitado no totem.
describe('consultarCpf', () => {
  it('aceita CPF com dígitos verificadores corretos e recusa o errado', async () => {
    await expect(consultarCpf({ cpf: CPF_SEM_CADASTRO })).resolves.toEqual({ cliente: null });
    await expect(consultarCpf({ cpf: '12345678900' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'CPF inválido',
    });
  });

  it('só procura o cadastro de fidelidade quando o cliente marcou essa finalidade', async () => {
    expect((await consultarCpf({ cpf: CPF_CADASTRADO })).cliente).toBeNull();
    expect((await consultarCpf({ cpf: CPF_CADASTRADO, fidelidade: false })).cliente).toBeNull();
    expect((await consultarCpf({ cpf: CPF_CADASTRADO, fidelidade: true })).cliente?.pontos).toBe(
      1250,
    );
  });

  it('CPF válido sem cadastro volta sem cliente, sem ser cadastrado', async () => {
    const antes = clientesFidelidade.size;
    expect((await consultarCpf({ cpf: CPF_SEM_CADASTRO, fidelidade: true })).cliente).toBeNull();
    expect(clientesFidelidade.size).toBe(antes);
  });

  it('não devolve cliente quando o programa de fidelidade está desligado', async () => {
    config.fidelidade.habilitado = false;
    expect((await consultarCpf({ cpf: CPF_CADASTRADO, fidelidade: true })).cliente).toBeNull();
  });
});

describe('informarFidelidade', () => {
  it('vincula ao pedido o cliente já cadastrado', async () => {
    const pedidoId = randomUUID();
    await consentir(pedidoId);
    const cliente = await informarFidelidade({ pedidoId, numeroFidelidade: CPF_CADASTRADO });
    expect(cliente.pontos).toBe(1250);
    expect((await obterCarrinho(pedidoId)).clienteId).toBe(cliente.id);
  });

  it('não cadastra CPF desconhecido: o pedido segue sem fidelidade', async () => {
    const pedidoId = randomUUID();
    await consentir(pedidoId);
    await expect(
      informarFidelidade({ pedidoId, numeroFidelidade: CPF_SEM_CADASTRO }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(clientesFidelidade.has(CPF_SEM_CADASTRO)).toBe(false);
    expect((await obterCarrinho(pedidoId)).clienteId).toBeUndefined();
  });
});

// US 09
describe('informarCpfNota', () => {
  it('aceita CPF formatado e guarda só os dígitos', async () => {
    const pedidoId = randomUUID();
    await consentir(pedidoId);
    const pedido = await informarCpfNota({ pedidoId, cpf: '111.444.777-35' });
    expect(pedido.cpfNaNota).toBe('11144477735');
  });

  it('rejeita CPF com formato inválido', async () => {
    await expect(informarCpfNota({ pedidoId: randomUUID(), cpf: '123' })).rejects.toThrow(HttpError);
  });

  it('rejeita CPF de 11 dígitos com dígito verificador errado e nada fica no pedido', async () => {
    const pedidoId = randomUUID();
    await consentir(pedidoId);
    await expect(informarCpfNota({ pedidoId, cpf: '12345678900' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'CPF inválido',
    });
    expect((await obterCarrinho(pedidoId)).cpfNaNota).toBeUndefined();
  });

  it('depois de um CPF inválido, dá para corrigir no mesmo pedido', async () => {
    const pedidoId = randomUUID();
    await consentir(pedidoId);
    await expect(informarCpfNota({ pedidoId, cpf: '12345678900' })).rejects.toThrow('CPF inválido');
    expect((await informarCpfNota({ pedidoId, cpf: CPF_CADASTRADO })).cpfNaNota).toBe(CPF_CADASTRADO);
  });

  it('desfaz a fidelidade e os pontos ao trocar o CPF do pedido', async () => {
    const pedidoId = await pedidoComLanche();
    await informarCpfNota({ pedidoId, cpf: CPF_CADASTRADO });
    await informarFidelidade({ pedidoId, numeroFidelidade: CPF_CADASTRADO });
    await usarPontos({ pedidoId, pontos: 300 });

    const pedido = await informarCpfNota({ pedidoId, cpf: CPF_SEM_CADASTRO });
    expect(pedido.clienteId).toBeUndefined();
    expect(pedido.pontosUsados).toBeUndefined();
    expect(pedido.valorAPagarCentavos).toBe(1890);
  });
});

// US 10
describe('pularIdentificacao', () => {
  it('tira CPF, fidelidade e pontos do pedido, que segue sem dados pessoais', async () => {
    const pedidoId = await pedidoComLanche();
    await informarCpfNota({ pedidoId, cpf: CPF_CADASTRADO });
    await informarFidelidade({ pedidoId, numeroFidelidade: CPF_CADASTRADO });
    await usarPontos({ pedidoId, pontos: 300 });

    const pedido = await pularIdentificacao({ pedidoId, versaoTermo: VERSAO_TERMO });
    expect(pedido.semDadosPessoais).toBe(true);
    expect(pedido.cpfNaNota).toBeUndefined();
    expect(pedido.clienteId).toBeUndefined();
    expect(pedido.descontoPontosCentavos).toBe(0);
    expect(pedido.valorAPagarCentavos).toBe(1890);
  });

  it('registra na auditoria a recusa das finalidades que foram apresentadas', async () => {
    const pedidoId = randomUUID();
    await pularIdentificacao({ pedidoId, versaoTermo: VERSAO_TERMO });
    const recusas = registrosConsentimento.filter((registro) => registro.pedidoId === pedidoId);
    expect(recusas.map(({ finalidade, aceito }) => [finalidade, aceito])).toEqual([
      ['cpf_nota', false],
      ['fidelidade', false],
    ]);

    // Com a fidelidade desligada, essa finalidade nem é apresentada.
    config.fidelidade.habilitado = false;
    const outro = randomUUID();
    await pularIdentificacao({ pedidoId: outro, versaoTermo: VERSAO_TERMO });
    expect(
      registrosConsentimento
        .filter((registro) => registro.pedidoId === outro)
        .map((registro) => registro.finalidade),
    ).toEqual(['cpf_nota']);
  });

  it('não permite informar o CPF de novo no mesmo pedido', async () => {
    const pedidoId = randomUUID();
    await pularIdentificacao({ pedidoId, versaoTermo: VERSAO_TERMO });
    await expect(consentir(pedidoId)).rejects.toMatchObject({ statusCode: 409 });
    await expect(informarCpfNota({ pedidoId, cpf: CPF_CADASTRADO })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect((await obterCarrinho(pedidoId)).cpfNaNota).toBeUndefined();
  });
});

describe('usarPontos', () => {
  async function pedidoIdentificado(): Promise<string> {
    const pedidoId = await pedidoComLanche();
    await informarFidelidade({ pedidoId, numeroFidelidade: CPF_CADASTRADO });
    return pedidoId;
  }

  it('abate os pontos do total sem mexer no saldo antes do pagamento', async () => {
    const pedidoId = await pedidoIdentificado();
    const pedido = await usarPontos({ pedidoId, pontos: 500 });
    expect(pedido.pontosUsados).toBe(500);
    expect(pedido.descontoPontosCentavos).toBe(500);
    expect(pedido.valorAPagarCentavos).toBe(1390);
    expect((await consultarFidelidade(CPF_CADASTRADO)).pontos).toBe(1250);
  });

  it('informa que não é possível usar mais pontos do que o saldo', async () => {
    const pedidoId = await pedidoIdentificado();
    await expect(usarPontos({ pedidoId, pontos: 1251 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Não é possível usar 1.251 pontos: seu saldo é de 1.250 pontos',
    });
    expect((await obterCarrinho(pedidoId)).pontosUsados).toBeUndefined();
  });

  it('exige um cliente de fidelidade identificado no pedido', async () => {
    const pedidoId = await pedidoComLanche();
    await expect(usarPontos({ pedidoId, pontos: 10 })).rejects.toThrow(/CPF cadastrado/);
  });

  it('rejeita quantidade de pontos negativa ou fracionada', async () => {
    const pedidoId = await pedidoIdentificado();
    await expect(usarPontos({ pedidoId, pontos: -5 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(usarPontos({ pedidoId, pontos: 1.5 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('com zero pontos, desfaz o resgate', async () => {
    const pedidoId = await pedidoIdentificado();
    await usarPontos({ pedidoId, pontos: 500 });
    const pedido = await usarPontos({ pedidoId, pontos: 0 });
    expect(pedido.pontosUsados).toBeUndefined();
    expect(pedido.valorAPagarCentavos).toBe(1890);
  });

  it('soma pontos e cupom quando o administrador permite', async () => {
    const pedidoId = await pedidoIdentificado();
    await aplicarCupom({ pedidoId, codigo: 'DESC5' });
    const pedido = await usarPontos({ pedidoId, pontos: 300 });
    expect(pedido.descontoCupomCentavos).toBe(500);
    expect(pedido.descontoPontosCentavos).toBe(300);
    expect(pedido.valorAPagarCentavos).toBe(1890 - 500 - 300);
  });

  it('recusa pontos em pedido com cupom quando o administrador não permite somar', async () => {
    config.fidelidade.combinaComCupom = false;
    const pedidoId = await pedidoIdentificado();
    await aplicarCupom({ pedidoId, codigo: 'DESC5' });
    await expect(usarPontos({ pedidoId, pontos: 300 })).rejects.toThrow(
      'Pontos e cupom não podem ser usados no mesmo pedido',
    );
  });
});
