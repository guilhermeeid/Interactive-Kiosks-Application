import type { FastifyInstance } from 'fastify';
import { registrarConsentimentos } from './consentimento.service';
import type { RegistrarConsentimentosBody } from './consentimento.types';
import { obterTermo, paginaTermos } from './termo';

// Rotas do consentimento LGPD (US 29).
export async function consentimentoRoutes(app: FastifyInstance): Promise<void> {
  // Termo vigente (versão + textos), lido pelo totem ao iniciar
  app.get('/termo', async () => {
    return obterTermo();
  });

  // Termos e Condições em página própria, para abrir no celular pelo QR Code do totem
  app.get('/termos', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(paginaTermos());
  });

  // Registra as decisões do cliente antes de qualquer dado pessoal ser enviado
  app.post<{ Body: RegistrarConsentimentosBody }>('/', async (request) => {
    return registrarConsentimentos(request.body);
  });
}
