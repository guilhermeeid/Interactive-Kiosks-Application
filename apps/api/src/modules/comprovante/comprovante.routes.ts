import type { FastifyInstance } from 'fastify';
import { MockEmissorFiscal } from '../../integrations/api-fiscal';
import { MockServicoNotificacao } from '../../integrations/notificacao';
import { dispensarComprovante, enviarComprovante } from './comprovante.service';
import type { DispensarComprovanteBody, EnviarComprovanteBody } from './comprovante.types';

// Rotas do Épico 4 — Emissão de Comprovante.
export async function comprovanteRoutes(app: FastifyInstance): Promise<void> {
  // TODO: substituir a instanciação direta por injeção de dependência quando os
  // provedores reais (ver integrations/api-fiscal e integrations/notificacao) existirem.
  const emissorFiscal = new MockEmissorFiscal();
  const servicoNotificacao = new MockServicoNotificacao();

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
