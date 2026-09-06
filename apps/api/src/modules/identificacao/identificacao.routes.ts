import type { FastifyInstance } from 'fastify';
import type { InformarCpfNotaBody, InformarFidelidadeBody } from './identificacao.types';

// Rotas do Épico 2 — Identificação do Cliente.
export async function identificacaoRoutes(app: FastifyInstance): Promise<void> {
  // US-04: Informar fidelidade
  // LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade no body)
  app.post<{ Body: InformarFidelidadeBody }>('/fidelidade', async (request, reply) => {
    // TODO: implementar handler chamando informarFidelidade(request.body).
    return reply.notImplemented();
  });

  // US-05: Informar CPF na nota
  // LGPD: dado pessoal — exige consentimento/criptografia (cpf no body)
  app.post<{ Body: InformarCpfNotaBody }>('/cpf-nota', async (request, reply) => {
    // TODO: implementar handler chamando informarCpfNota(request.body).
    return reply.notImplemented();
  });
}
