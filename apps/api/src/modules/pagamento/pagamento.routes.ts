import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../config/env';
import { HttpError } from '../../errors';
import { MockPagamentoGateway } from '../../integrations/gateway-pagamento';
import { gatewayPagamento } from '../../integrations/instancias';
import {
  cancelarPix,
  consultarPix,
  escolherFormaPagamento,
  processarNotificacaoPix,
  verificarCobrancasPix,
} from './pagamento.service';
import type { EscolherFormaPagamentoBody } from './pagamento.types';

const INTERVALO_VARREDURA_PIX_MS = 5_000;

function tokenConfere(recebido: unknown, esperado: string): boolean {
  if (typeof recebido !== 'string') return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Rotas do Épico 3 — Pagamento.
export async function pagamentoRoutes(app: FastifyInstance): Promise<void> {
  const gateway = gatewayPagamento;

  // No mock, o "banco" avisa direto pela função; no adapter real, pela rota do webhook.
  if (gateway instanceof MockPagamentoGateway) {
    gateway.aoNotificar((transacaoId) =>
      processarNotificacaoPix(transacaoId, gateway).catch((err: Error) =>
        app.log.error(`[pix] Falha ao processar o aviso de ${transacaoId}: ${err.message}`),
      ),
    );
  }

  // QR Codes vencidos voltam ao carrinho mesmo sem o totem perguntar.
  const varredura = setInterval(() => {
    void verificarCobrancasPix(gateway);
  }, INTERVALO_VARREDURA_PIX_MS);
  varredura.unref();
  app.addHook('onClose', async () => clearInterval(varredura));

  // US-06: Escolher forma de pagamento (Pix: gera ou devolve o QR Code em vigor)
  app.post<{ Body: EscolherFormaPagamentoBody }>('/', async (request) => {
    return escolherFormaPagamento(request.body, gateway);
  });

  // US 11: situação do Pix enquanto o QR está na tela
  app.get<{ Params: { pedidoId: string } }>('/:pedidoId/pix', async (request) => {
    return consultarPix(request.params.pedidoId, gateway);
  });

  // US 11: o cliente desistiu do Pix (outra forma ou voltar ao carrinho)
  app.post<{ Params: { pedidoId: string } }>('/:pedidoId/pix/cancelar', async (request) => {
    return cancelarPix(request.params.pedidoId, gateway);
  });

  // US 11: webhook do banco. Protegido por token (PIX_WEBHOOK_TOKEN no cabeçalho
  // `x-webhook-token`); o status é sempre conferido no banco antes de valer.
  app.post<{ Body: { transacaoId?: unknown } }>('/pix/webhook', async (request) => {
    if (!tokenConfere(request.headers['x-webhook-token'], loadEnv().pixWebhookToken)) {
      throw new HttpError(401, 'Token do webhook inválido');
    }
    const transacaoId = request.body?.transacaoId;
    if (typeof transacaoId !== 'string' || !transacaoId) {
      throw new HttpError(400, 'Informe a transação');
    }
    await processarNotificacaoPix(transacaoId, gateway);
    return { recebido: true };
  });

  // Simulador do banco (só com o gateway mock, fora de produção): "paga" uma cobrança,
  // inclusive uma já expirada no totem, para testar a confirmação atrasada.
  if (gateway instanceof MockPagamentoGateway && process.env.NODE_ENV !== 'production') {
    app.post<{ Params: { transacaoId: string } }>(
      '/pix/simulador/:transacaoId/pagar',
      async (request) => {
        await gateway.pagar(request.params.transacaoId);
        return { pago: true };
      },
    );
  }
}
