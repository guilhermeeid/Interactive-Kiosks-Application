import { randomUUID } from 'node:crypto';
import type { ResultadoPagamento } from '@totem/shared';
import type {
  CobrancaPixCriada,
  CriarCobrancaPixParams,
  IniciarPagamentoParams,
  OuvinteNotificacaoPix,
  PagamentoGateway,
} from './PagamentoGateway';

// Simulação do Pix, para testar no totem o que acontece com conexão instável sem banco
// real (variáveis de ambiente lidas a cada cobrança):
// - MOCK_PIX_PAGAR_APOS_SEGUNDOS: o "cliente paga" sozinho depois deste tempo (padrão 10).
//   `nunca` deixa o QR expirar; aí o pagamento só acontece pela rota do simulador
//   (POST /pagamento/pix/simulador/:transacaoId/pagar), inclusive depois de expirado —
//   a confirmação atrasada.
// - MOCK_PIX_ATRASO_MS: quanto o "banco" demora para criar a cobrança (padrão 0). Acima
//   de PIX_TEMPO_LIMITE_MS, o totem recebe o aviso de instabilidade.
// - MOCK_PIX_WEBHOOK_ATRASO_MS: quanto o aviso de pagamento demora a chegar (padrão 0).
function segundosAtePagar(): number | null {
  const valor = process.env.MOCK_PIX_PAGAR_APOS_SEGUNDOS;
  if (valor === 'nunca') return null;
  const segundos = Number(valor ?? 10);
  return Number.isFinite(segundos) && segundos >= 0 ? segundos : 10;
}

function milissegundos(variavel: string): number {
  const valor = Number(process.env[variavel] ?? 0);
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

// Monta um "Pix copia e cola" no formato do BR Code (EMV), só para ilustração: não é
// pagável por um aplicativo de banco de verdade.
function brCode(transacaoId: string, valorCentavos: number): string {
  const campo = (id: string, valor: string) =>
    `${id}${String(valor.length).padStart(2, '0')}${valor}`;
  const conta = campo('00', 'br.gov.bcb.pix') + campo('25', `mock-psp.local/cobv/${transacaoId}`);
  return (
    campo('00', '01') +
    campo('01', '12') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', (valorCentavos / 100).toFixed(2)) +
    campo('58', 'BR') +
    campo('59', 'TOTEM MOCK') +
    campo('60', 'SAO PAULO') +
    campo('62', campo('05', '***')) +
    '6304MOCK'
  );
}

interface CobrancaMock {
  resultado: ResultadoPagamento;
  expiraEm: number;
  temporizador?: ReturnType<typeof setTimeout>;
}

// Implementação mock/stub de PagamentoGateway: cartão e vale são aprovados na hora;
// Pix gera um QR fictício que é "pago" depois de alguns segundos (ver acima) e avisa
// pelo webhook simulado. Existe para o MVP rodar de ponta a ponta antes da integração
// real (tokenização via SDK do pinpad e API Pix do PSP) existir.
// TODO: implementar adapter real (ex.: Stone, Cielo, PagSeguro; Pix via API do PSP com
// webhook HTTP em POST /pagamento/pix/webhook) atendendo a interface PagamentoGateway,
// sem alterar apps/api/src/modules/pagamento.
export class MockPagamentoGateway implements PagamentoGateway {
  private transacoes = new Map<string, CobrancaMock>();
  private porChave = new Map<string, string>();
  private ouvinte: OuvinteNotificacaoPix | null = null;

  // O "webhook": no adapter real, o banco chama a rota HTTP; aqui, a função direto.
  aoNotificar(ouvinte: OuvinteNotificacaoPix): void {
    this.ouvinte = ouvinte;
  }

  async iniciarPagamento(params: IniciarPagamentoParams): Promise<ResultadoPagamento> {
    const resultado: ResultadoPagamento = {
      transacaoId: randomUUID(),
      formaPagamento: params.formaPagamento,
      status: 'autorizado',
      valorCentavos: params.valorCentavos,
      autorizadoEm: new Date().toISOString(),
    };
    this.transacoes.set(resultado.transacaoId, { resultado, expiraEm: Infinity });
    return resultado;
  }

  async criarCobrancaPix(params: CriarCobrancaPixParams): Promise<CobrancaPixCriada> {
    const atraso = milissegundos('MOCK_PIX_ATRASO_MS');
    if (atraso) await esperar(atraso);

    const existente = this.porChave.get(params.chaveIdempotencia);
    if (existente) {
      return this.descrever(existente);
    }
    const transacaoId = randomUUID();
    const expiraEm = Date.now() + params.expiraEmSegundos * 1000;
    const cobranca: CobrancaMock = {
      resultado: {
        transacaoId,
        formaPagamento: 'pix',
        status: 'pendente',
        valorCentavos: params.valorCentavos,
      },
      expiraEm,
    };
    this.transacoes.set(transacaoId, cobranca);
    this.porChave.set(params.chaveIdempotencia, transacaoId);

    const segundos = segundosAtePagar();
    if (segundos !== null) {
      cobranca.temporizador = setTimeout(() => {
        // Só paga se o QR ainda valer: um QR expirado ou cancelado não aceita pagamento.
        if (cobranca.resultado.status === 'pendente' && Date.now() <= cobranca.expiraEm) {
          void this.pagar(transacaoId);
        }
      }, segundos * 1000);
      cobranca.temporizador.unref?.();
    }
    return this.descrever(transacaoId);
  }

  // Simulador: o cliente pagou. Aceita também uma cobrança já expirada no totem, para
  // reproduzir a confirmação que chega atrasada.
  async pagar(transacaoId: string): Promise<void> {
    const cobranca = this.transacoes.get(transacaoId);
    if (!cobranca || cobranca.resultado.status === 'autorizado') {
      return;
    }
    cobranca.resultado.status = 'autorizado';
    cobranca.resultado.autorizadoEm = new Date().toISOString();
    const atraso = milissegundos('MOCK_PIX_WEBHOOK_ATRASO_MS');
    if (atraso) await esperar(atraso);
    await this.ouvinte?.(transacaoId);
  }

  async consultarStatus(transacaoId: string): Promise<ResultadoPagamento> {
    const cobranca = this.transacoes.get(transacaoId);
    if (!cobranca) {
      throw new Error(`Transação "${transacaoId}" não encontrada`);
    }
    return { ...cobranca.resultado };
  }

  async cancelarCobranca(transacaoId: string): Promise<void> {
    const cobranca = this.transacoes.get(transacaoId);
    if (cobranca?.resultado.status === 'pendente') {
      cobranca.resultado.status = 'cancelado';
      clearTimeout(cobranca.temporizador);
    }
  }

  async estornar(transacaoId: string): Promise<void> {
    const cobranca = this.transacoes.get(transacaoId);
    if (cobranca) {
      cobranca.resultado.status = 'estornado';
    }
  }

  private descrever(transacaoId: string): CobrancaPixCriada {
    const cobranca = this.transacoes.get(transacaoId) as CobrancaMock;
    return {
      transacaoId,
      copiaECola: brCode(transacaoId, cobranca.resultado.valorCentavos),
      valorCentavos: cobranca.resultado.valorCentavos,
      expiraEm: new Date(cobranca.expiraEm).toISOString(),
    };
  }
}
