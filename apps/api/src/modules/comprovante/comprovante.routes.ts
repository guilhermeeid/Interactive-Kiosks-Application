import type { FastifyInstance } from 'fastify';
import { emissorFiscal, servicoNotificacao } from '../../integrations/instancias';
import { dispensarComprovante, enviarComprovante, obterComprovante } from './comprovante.service';
import type { DispensarComprovanteBody, EnviarComprovanteBody } from './comprovante.types';

// Rotas do Épico 4 — Emissão de Comprovante.
export async function comprovanteRoutes(app: FastifyInstance): Promise<void> {
  // US 15: NFC-e do pedido pago (QR Code na tela de conclusão)
  app.get<{ Params: { pedidoId: string } }>('/:pedidoId', async (request) => {
    return obterComprovante(request.params.pedidoId);
  });

  // US-08: Receber comprovante por e-mail/SMS
  // LGPD: dado pessoal — exige consentimento/criptografia (email/telefone no body)
  app.post<{ Body: EnviarComprovanteBody }>('/', async (request) => {
    return enviarComprovante(request.body, emissorFiscal, servicoNotificacao);
  });

  // Concluir o pedido sem comprovante por e-mail/SMS (nenhum dado pessoal envolvido)
  app.post<{ Body: DispensarComprovanteBody }>('/dispensar', async (request) => {
    return dispensarComprovante(request.body, emissorFiscal);
  });
}
