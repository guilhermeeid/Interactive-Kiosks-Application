import type { FastifyInstance } from 'fastify';
import { registrarConsentimentos } from './consentimento.service';
import type { RegistrarConsentimentosBody } from './consentimento.types';
import { obterTermo } from './termo';

// Rotas do consentimento LGPD (US 29).
export async function consentimentoRoutes(app: FastifyInstance): Promise<void> {
  // Termo vigente (versão + textos), lido pelo totem ao iniciar
  app.get('/termo', async () => {
    return obterTermo();
  });

  // Registra as decisões do cliente antes de qualquer dado pessoal ser enviado
  app.post<{ Body: RegistrarConsentimentosBody }>('/', async (request) => {
    return registrarConsentimentos(request.body);
  });
}
