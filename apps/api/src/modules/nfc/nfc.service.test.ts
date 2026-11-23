import type { EventoNfc } from '@totem/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { cartoesNfc } from '../../db/memory-store';
import {
  assinarEventos,
  iniciarCadastro,
  leitorAtivo,
  listarCartoes,
  normalizarNumeroSerie,
  obterCadastro,
  processarLeitura,
  registrarSinal,
  reiniciarNfc,
  removerCartao,
  verificarLeitor,
} from './nfc.service';

const T0 = 1_000_000;

function eventos(): EventoNfc[] {
  const recebidos: EventoNfc[] = [];
  assinarEventos((evento) => recebidos.push(evento));
  return recebidos;
}

afterEach(() => {
  reiniciarNfc();
  cartoesNfc.clear();
});

describe('número de série', () => {
  it('aceita os formatos dos apps e normaliza para aa:bb:cc:dd', () => {
    expect(normalizarNumeroSerie('E6:D2:A0:CA')).toBe('e6:d2:a0:ca');
    expect(normalizarNumeroSerie('e6d2a0ca')).toBe('e6:d2:a0:ca');
    expect(normalizarNumeroSerie('04-11-22-33-44-55-66')).toBe('04:11:22:33:44:55:66');
    expect(normalizarNumeroSerie('e6:d2')).toBeUndefined();
    expect(normalizarNumeroSerie(42)).toBeUndefined();
  });
});

describe('leitura (modo híbrido)', () => {
  it('código gravado no cartão manda o item ao totem', () => {
    const recebidos = eventos();
    const resultado = processarLeitura({ textos: ['totem-item:suco-natural'] }, T0);
    expect(resultado).toMatchObject({
      tipo: 'item',
      itemCardapioId: 'suco-natural',
      origem: 'codigo',
    });
    expect(recebidos.at(-1)).toEqual({
      tipo: 'item',
      itemCardapioId: 'suco-natural',
      nome: 'Suco Natural',
    });
  });

  it('cartão travado vale pelo número de série cadastrado', () => {
    cartoesNfc.set('e6:d2:a0:ca', {
      numeroSerie: 'e6:d2:a0:ca',
      itemCardapioId: 'batata-frita',
      cadastradoEm: new Date(T0).toISOString(),
    });
    expect(processarLeitura({ numeroSerie: 'E6:D2:A0:CA' }, T0)).toMatchObject({
      tipo: 'item',
      itemCardapioId: 'batata-frita',
      origem: 'cadastro',
    });
  });

  it('o código gravado vale mais que o cadastro (o cartão foi regravado)', () => {
    cartoesNfc.set('e6:d2:a0:ca', {
      numeroSerie: 'e6:d2:a0:ca',
      itemCardapioId: 'batata-frita',
      cadastradoEm: new Date(T0).toISOString(),
    });
    expect(
      processarLeitura({ numeroSerie: 'e6:d2:a0:ca', textos: ['totem-item:suco-natural'] }, T0),
    ).toMatchObject({ itemCardapioId: 'suco-natural', origem: 'codigo' });
  });

  it('cartão desconhecido ou com item que saiu do cardápio avisa sem guardar nada', () => {
    const recebidos = eventos();
    expect(processarLeitura({ numeroSerie: '01:02:03:04' }, T0).tipo).toBe('desconhecido');
    expect(processarLeitura({ textos: ['totem-item:nao-existe'] }, T0)).toMatchObject({
      tipo: 'desconhecido',
      motivo: expect.stringMatching(/não está mais no cardápio/),
    });
    expect(recebidos.filter((e) => e.tipo === 'desconhecido')).toHaveLength(2);
    expect(cartoesNfc.size).toBe(0);
  });

  it('o mesmo cartão encostado de novo em 2 s conta uma vez só', () => {
    const leitura = { textos: ['totem-item:suco-natural'], numeroSerie: 'aa:bb:cc:dd' };
    expect(processarLeitura(leitura, T0).tipo).toBe('item');
    expect(processarLeitura(leitura, T0 + 1_500).tipo).toBe('repetido');
    expect(processarLeitura(leitura, T0 + 2_100).tipo).toBe('item');
  });

  it('leitura vazia é recusada', () => {
    expect(() => processarLeitura({ textos: ['outra coisa'] }, T0)).toThrow(/número de série/);
  });
});

describe('leitor ativo', () => {
  it('fica ativo com o sinal e o totem é avisado quando ele some', () => {
    const recebidos = eventos();
    registrarSinal(T0);
    expect(leitorAtivo(T0 + 10_000)).toBe(true);
    expect(recebidos).toEqual([{ tipo: 'estado', leitorAtivo: true }]);
    verificarLeitor(T0 + 16_000);
    expect(recebidos.at(-1)).toEqual({ tipo: 'estado', leitorAtivo: false });
  });
});

describe('cadastro de cartão travado', () => {
  it('o próximo cartão aproximado fica ligado ao item, sem ir para o carrinho', async () => {
    const agora = Date.now();
    await expect(iniciarCadastro('suco-natural', agora)).rejects.toMatchObject({ statusCode: 409 });
    registrarSinal(agora);
    await iniciarCadastro('suco-natural', agora);
    const recebidos = eventos();

    expect(processarLeitura({ numeroSerie: 'E6:D2:A0:CA' }, agora + 1_000)).toMatchObject({
      tipo: 'cadastrado',
      numeroSerie: 'e6:d2:a0:ca',
    });
    expect(recebidos.some((e) => e.tipo === 'item')).toBe(false);
    expect((await obterCadastro())?.concluido?.numeroSerie).toBe('e6:d2:a0:ca');
    expect(await listarCartoes()).toMatchObject([
      { numeroSerie: 'e6:d2:a0:ca', nomeItem: 'Suco Natural' },
    ]);

    // Daí em diante, o cartão adiciona o item.
    expect(processarLeitura({ numeroSerie: 'e6d2a0ca' }, agora + 5_000).tipo).toBe('item');
    await removerCartao('E6:D2:A0:CA');
    expect(cartoesNfc.size).toBe(0);
  });

  it('cadastro vencido (60 s) não captura o cartão; item inexistente é recusado', async () => {
    const agora = Date.now();
    registrarSinal(agora);
    await expect(iniciarCadastro('nao-existe', agora)).rejects.toMatchObject({ statusCode: 400 });
    await iniciarCadastro('suco-natural', agora);
    expect(processarLeitura({ numeroSerie: 'e6:d2:a0:ca' }, agora + 61_000).tipo).toBe(
      'desconhecido',
    );
  });
});
