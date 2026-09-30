import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../../errors';
import { consultarFidelidade, informarCpfNota, informarFidelidade } from './identificacao.service';

describe('informarFidelidade', () => {
  it('cria um cliente novo com 0 pontos para um número de fidelidade inédito', async () => {
    const numero = `fid-${randomUUID()}`;
    const cliente = await informarFidelidade({ pedidoId: randomUUID(), numeroFidelidade: numero });
    expect(cliente.pontos).toBe(0);
    expect(cliente.numeroFidelidade).toBe(numero);
  });

  it('reutiliza o mesmo cliente para o mesmo número de fidelidade', async () => {
    const numero = `fid-${randomUUID()}`;
    const primeiro = await informarFidelidade({ pedidoId: randomUUID(), numeroFidelidade: numero });
    const segundo = await informarFidelidade({ pedidoId: randomUUID(), numeroFidelidade: numero });
    expect(segundo.id).toBe(primeiro.id);
  });

  it('retorna o saldo de pontos do cliente cadastrado com o CPF 123.456.789-00', async () => {
    const cliente = await informarFidelidade({
      pedidoId: randomUUID(),
      numeroFidelidade: '12345678900',
    });
    expect(cliente.pontos).toBe(1250);
  });
});

describe('consultarFidelidade', () => {
  it('retorna o saldo do cliente cadastrado', async () => {
    const cliente = await consultarFidelidade('12345678900');
    expect(cliente.pontos).toBe(1250);
  });

  it('lança 404 para número não cadastrado, sem criar cliente novo', async () => {
    const numero = `fid-${randomUUID()}`;
    await expect(consultarFidelidade(numero)).rejects.toMatchObject({ statusCode: 404 });
    await expect(consultarFidelidade(numero)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('informarCpfNota', () => {
  it('aceita CPF formatado e guarda só os dígitos', async () => {
    const pedido = await informarCpfNota({ pedidoId: randomUUID(), cpf: '111.444.777-35' });
    expect(pedido.cpfNaNota).toBe('11144477735');
  });

  it('rejeita CPF com formato inválido', async () => {
    await expect(informarCpfNota({ pedidoId: randomUUID(), cpf: '123' })).rejects.toThrow(HttpError);
  });
});
