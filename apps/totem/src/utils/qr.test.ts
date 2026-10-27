import { describe, expect, it } from 'vitest';
import { interpretarCodigo, qrDeCupom, qrDeFidelidade } from './qr';

describe('interpretarCodigo', () => {
  it('reconhece o QR de cupom e o de cartão de fidelidade gerados pela área restrita', () => {
    expect(interpretarCodigo(qrDeCupom('BEMVINDO10'))).toEqual({
      tipo: 'cupom',
      codigo: 'BEMVINDO10',
    });
    expect(interpretarCodigo(qrDeFidelidade('cliente-demo'))).toEqual({
      tipo: 'fidelidade',
      codigo: 'cliente-demo',
    });
  });

  it('aceita um código de barras ou QR que traga só o código do cupom, em qualquer caixa', () => {
    expect(interpretarCodigo('  desc5 ')).toEqual({ tipo: 'cupom', codigo: 'DESC5' });
    // Código de produto (EAN-13) também vai para a API, que o recusa como cupom.
    expect(interpretarCodigo('7891234567895')).toEqual({ tipo: 'cupom', codigo: '7891234567895' });
  });

  it('não reconhece endereços, textos soltos ou prefixos vazios', () => {
    expect(interpretarCodigo('https://exemplo.com')).toEqual({ tipo: 'desconhecido' });
    expect(interpretarCodigo('TOTEM-FIDELIDADE:')).toEqual({ tipo: 'desconhecido' });
    expect(interpretarCodigo('TOTEM-CUPOM:a-b')).toEqual({ tipo: 'desconhecido' });
  });
});
