import type { FastifyInstance } from 'fastify';
import { consultarFidelidade, informarCpfNota, informarFidelidade } from './identificacao.service';
import type {
  ConsultarFidelidadeParams,
  InformarCpfNotaBody,
  InformarFidelidadeBody,
} from './identificacao.types';

// Rotas do Épico 2 — Identificação do Cliente.
export async function identificacaoRoutes(app: FastifyInstance): Promise<void> {
  // US-04: Informar fidelidade
  // LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade no body)
  app.post<{ Body: InformarFidelidadeBody }>('/fidelidade', async (request) => {
    return informarFidelidade(request.body);
  });

  // US-04: Consultar saldo de pontos (sem cadastrar)
  // LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade na URL)
  app.get<{ Params: ConsultarFidelidadeParams }>('/fidelidade/:numeroFidelidade', async (request) => {
    return consultarFidelidade(request.params.numeroFidelidade);
  });

  // US-05: Informar CPF na nota
  // LGPD: dado pessoal — exige consentimento/criptografia (cpf no body)
  app.post<{ Body: InformarCpfNotaBody }>('/cpf-nota', async (request) => {
    return informarCpfNota(request.body);
  });
}
