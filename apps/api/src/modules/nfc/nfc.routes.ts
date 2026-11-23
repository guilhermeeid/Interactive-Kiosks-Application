import type { LeituraNfc } from '@totem/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { HttpError } from '../../errors';
import {
  assinarEventos,
  leitorAtivo,
  processarLeitura,
  registrarSinal,
  verificarLeitor,
} from './nfc.service';

const ENDERECOS_LOCAIS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// O leitor fala com a API pelo cabo USB-C: o `adb reverse` entrega as requisições do
// celular como se viessem do próprio notebook. Leituras vindas da rede são recusadas —
// ninguém no Wi-Fi da loja consegue pôr itens no carrinho do totem.
function exigirLeitorPeloCabo(request: FastifyRequest): void {
  if (!ENDERECOS_LOCAIS.has(request.ip)) {
    throw new HttpError(403, 'O leitor NFC precisa estar ligado ao totem pelo cabo USB');
  }
}

// Rotas do módulo NFC (tier Intermediário, opcional).
export async function nfcRoutes(app: FastifyInstance): Promise<void> {
  // Anuncia ao totem quando o leitor deixa de mandar sinal.
  const verificacao = setInterval(() => verificarLeitor(), 5_000);
  verificacao.unref();
  app.addHook('onClose', async () => clearInterval(verificacao));

  // Leitor (celular): um cartão aproximado
  app.post<{ Body: LeituraNfc }>('/leitura', async (request) => {
    exigirLeitorPeloCabo(request);
    return processarLeitura(request.body);
  });

  // Leitor (celular): "estou ligado", a cada poucos segundos
  app.post('/sinal', async (request, reply) => {
    exigirLeitorPeloCabo(request);
    registrarSinal();
    return reply.status(204).send();
  });

  app.get('/estado', async () => ({ leitorAtivo: leitorAtivo() }));

  // Totem: leituras e estado do leitor ao vivo (Server-Sent Events). Sem dado pessoal.
  app.get('/eventos', (request, reply) => {
    reply.hijack();
    const resposta = reply.raw;
    resposta.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': request.headers.origin ?? '*',
    });
    const enviar = (evento: unknown) => resposta.write(`data: ${JSON.stringify(evento)}\n\n`);
    enviar({ tipo: 'estado', leitorAtivo: leitorAtivo() });
    const cancelar = assinarEventos(enviar);
    // Comentário periódico: mantém a conexão aberta em proxies e detecta queda.
    const pulso = setInterval(() => resposta.write(': pulso\n\n'), 20_000);
    request.raw.on('close', () => {
      clearInterval(pulso);
      cancelar();
    });
  });
}
