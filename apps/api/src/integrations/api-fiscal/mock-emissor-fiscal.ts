import { randomInt } from 'node:crypto';
import {
  ErroFiscal,
  type EmissorFiscal,
  type EmitirNotaFiscalParams,
  type NotaFiscalEmitida,
} from './EmissorFiscal';

// Dígito verificador da chave de acesso (módulo 11, pesos 2 a 9 da direita para a
// esquerda), como na chave real de 44 dígitos.
function digitoVerificador(chave43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

function digitos(quantidade: number): string {
  return Array.from({ length: quantidade }, () => randomInt(10)).join('');
}

// Simulação de falha, para testar o caminho de erro fiscal sem provedor real:
// MOCK_FISCAL_FALHA=sempre (toda emissão falha) ou um número entre 0 e 1 (chance de
// falhar). Sem a variável, toda emissão é autorizada.
function deveFalhar(): boolean {
  const config = process.env.MOCK_FISCAL_FALHA;
  if (!config) return false;
  if (config === 'sempre') return true;
  const chance = Number(config);
  return Number.isFinite(chance) && Math.random() < chance;
}

// Implementação mock/stub de EmissorFiscal: gera número, chave de acesso e URL de
// consulta fictícios, sem contato com a SEFAZ. Existe para o MVP rodar de ponta a ponta
// antes da integração real existir.
// TODO: implementar adapter real (ex.: provedor de NFC-e do estado/município)
// atendendo a interface EmissorFiscal, sem alterar apps/api/src/modules/comprovante.
export class MockEmissorFiscal implements EmissorFiscal {
  private proximoNumero = 1;

  async emitirNotaFiscal(params: EmitirNotaFiscalParams): Promise<NotaFiscalEmitida> {
    if (deveFalhar()) {
      throw new ErroFiscal('Rejeição 999: falha simulada na SEFAZ (MOCK_FISCAL_FALHA)');
    }
    const numero = String(this.proximoNumero++).padStart(9, '0');
    const serie = '001';
    const agora = new Date();
    const aamm = `${String(agora.getFullYear()).slice(2)}${String(agora.getMonth() + 1).padStart(2, '0')}`;
    // cUF(35) AAMM CNPJ(14) modelo(65) série(3) número(9) tpEmis(1) código(8) + DV
    const chave43 = `35${aamm}${'0'.repeat(14)}65${serie}${numero}1${digitos(8)}`;
    const chaveAcesso = chave43 + digitoVerificador(chave43);
    return {
      pedidoId: params.pedido.id,
      numero,
      serie,
      chaveAcesso,
      urlConsulta: `https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=${chaveAcesso}|2|2|1|MOCK`,
      cpfDestinatario: params.cpfNaNota,
      urlDanfe: `https://mock-fiscal.local/danfe/${chaveAcesso}`,
      emitidaEm: agora.toISOString(),
    };
  }
}
