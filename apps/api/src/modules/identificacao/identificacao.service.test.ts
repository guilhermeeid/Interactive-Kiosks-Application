import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../../errors';
import { informarCpfNota, informarFidelidade } from './identificacao.service';

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
