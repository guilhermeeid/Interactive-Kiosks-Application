import type { FastifyInstance } from 'fastify';
import { MockEmissorFiscal } from '../../integrations/api-fiscal';
import { MockServicoNotificacao } from '../../integrations/notificacao';
import type { EnviarComprovanteBody } from './comprovante.types';

// Rotas do Épico 4 — Emissão de Comprovante.
export async function comprovanteRoutes(app: FastifyInstance): Promise<void> {
  // TODO: substituir a instanciação direta por injeção de dependência quando os
  // provedores reais (ver integrations/api-fiscal e integrations/notificacao) existirem.
  const emissorFiscal = new MockEmissorFiscal();
  const servicoNotificacao = new MockServicoNotificacao();

  // US-08: Receber comprovante por e-mail/SMS
  // LGPD: dado pessoal — exige consentimento/criptografia (email/telefone no body)
  app.post<{ Body: EnviarComprovanteBody }>('/', async (request, reply) => {
    // TODO: implementar handler chamando
    // enviarComprovante(request.body, emissorFiscal, servicoNotificacao).
    return reply.notImplemented();
  });
}
