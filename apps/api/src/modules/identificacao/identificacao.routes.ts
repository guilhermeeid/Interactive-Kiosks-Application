import type { FastifyInstance } from 'fastify';
import {
  consultarCpf,
  informarCpfNota,
  informarFidelidade,
  informarFidelidadePorQr,
  usarPontos,
} from './identificacao.service';
import type {
  ConsultarCpfBody,
  InformarCpfNotaBody,
  InformarFidelidadeBody,
  InformarFidelidadePorQrBody,
  UsarPontosBody,
} from './identificacao.types';

// Rotas do Épico 2 — Identificação do Cliente.
// O CPF sempre viaja no corpo da requisição, nunca na URL: a URL vai para o log do
// servidor e o corpo não.
export async function identificacaoRoutes(app: FastifyInstance): Promise<void> {
  // US 09 / US-04: Conferir o CPF digitado (dígitos verificadores + saldo de fidelidade)
  // LGPD: dado pessoal — exige consentimento/criptografia (cpf no body)
  app.post<{ Body: ConsultarCpfBody }>('/cpf', async (request) => {
    return consultarCpf(request.body);
  });

  // US-04: Informar fidelidade
  // LGPD: dado pessoal — exige consentimento/criptografia (numeroFidelidade no body)
  app.post<{ Body: InformarFidelidadeBody }>('/fidelidade', async (request) => {
    return informarFidelidade(request.body);
  });

  // Usar pontos de fidelidade como desconto no pedido
  app.post<{ Body: UsarPontosBody }>('/fidelidade/pontos', async (request) => {
    return usarPontos(request.body);
  });

  // US 09: Informar CPF na nota
  // LGPD: dado pessoal — exige consentimento/criptografia (cpf no body)
  app.post<{ Body: InformarCpfNotaBody }>('/cpf-nota', async (request) => {
    return informarCpfNota(request.body);
  });

  // Fidelidade pelo QR Code do cartão do cliente
  app.post<{ Body: InformarFidelidadePorQrBody }>('/fidelidade/qr', async (request) => {
    return informarFidelidadePorQr(request.body);
  });
}
