import type { FastifyInstance } from 'fastify';
import { informarCpfNota, informarFidelidade } from './identificacao.service';
import type { InformarCpfNotaBody, InformarFidelidadeBody } from './identificacao.types';

// Rotas do Épico 2 — Identificação do Cliente.
export async function identificacaoRoutes(app: FastifyInstance): Promise<void> {
  // US-04: Informar fidelidade
  // LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade no body)
  app.post<{ Body: InformarFidelidadeBody }>('/fidelidade', async (request) => {
    return informarFidelidade(request.body);
  });

  // US-05: Informar CPF na nota
  // LGPD: dado pessoal — exige consentimento/criptografia (cpf no body)
  app.post<{ Body: InformarCpfNotaBody }>('/cpf-nota', async (request) => {
    return informarCpfNota(request.body);
  });
}
