import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ClienteFidelidade,
  ConfigTotem,
  Cupom,
  ItemCardapio,
  Pedido,
  RegistroConsentimento,
} from '@totem/shared';
import { HttpError } from '../errors';

// Persistência em disco do que o administrador configura (e do que muda a cada venda:
// estoque, pontos, usos de cupom, números de pedido em aberto). Sem isso, reiniciar a
// API devolveria o totem à configuração de fábrica.
// Fica em apps/api/data (fora do git): estado.json + imagens/ + a trilha de auditoria do
// consentimento. É um passo intermediário até o Postgres ser ligado — ver memory-store.ts.
const DIRETORIO = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../../data');
const ARQUIVO_ESTADO = join(DIRETORIO, 'estado.json');
const ARQUIVO_AUDITORIA = join(DIRETORIO, 'auditoria-consentimento.jsonl');
const DIRETORIO_IMAGENS = join(DIRETORIO, 'imagens');

// Os testes rodam só em memória, para não ler nem sobrescrever os dados reais.
const ATIVA = !process.env.VITEST;

export interface EstadoSalvo {
  config: ConfigTotem;
  itensCardapio: ItemCardapio[];
  cupons: Cupom[];
  clientesFidelidade: ClienteFidelidade[];
  pedidos: Pedido[];
}

export function carregarEstado(): Partial<EstadoSalvo> | null {
  if (!ATIVA || !existsSync(ARQUIVO_ESTADO)) {
    return null;
  }
  return JSON.parse(readFileSync(ARQUIVO_ESTADO, 'utf8'));
}

export function salvarEstado(estado: EstadoSalvo): void {
  if (!ATIVA) {
    return;
  }
  mkdirSync(DIRETORIO, { recursive: true });
  // Grava num temporário e renomeia, para uma queda no meio da escrita não corromper
  // o arquivo.
  const temporario = `${ARQUIVO_ESTADO}.tmp`;
  writeFileSync(temporario, JSON.stringify(estado, null, 2));
  renameSync(temporario, ARQUIVO_ESTADO);
}

// ---------- Auditoria do consentimento (US 29) ----------

// Um registro por linha, só com acréscimos: nada é reescrito nem apagado, e o arquivo
// não cresce o custo de cada gravação.
export function carregarAuditoriaConsentimento(): RegistroConsentimento[] {
  if (!ATIVA || !existsSync(ARQUIVO_AUDITORIA)) {
    return [];
  }
  return readFileSync(ARQUIVO_AUDITORIA, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((linha) => JSON.parse(linha));
}

export function anexarAuditoriaConsentimento(registro: RegistroConsentimento): void {
  if (!ATIVA) {
    return;
  }
  mkdirSync(DIRETORIO, { recursive: true });
  appendFileSync(ARQUIVO_AUDITORIA, `${JSON.stringify(registro)}\n`);
}

// ---------- Imagens (fotos dos itens e logotipo) ----------

const TIPOS_IMAGEM: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};
const DATA_URL_IMAGEM = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/;
const NOME_IMAGEM = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;
const TAMANHO_MAXIMO_IMAGEM = 2 * 1024 * 1024;

// Caminho de imagem que a API aceita em itens e no logotipo: só o que ela mesma gerou.
export const CAMINHO_IMAGEM = /^\/imagens\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

// Só imagens raster: SVG fica de fora porque pode carregar script.
export function interpretarImagem(dataUrl: unknown): { extensao: string; conteudo: Buffer } {
  const partes = typeof dataUrl === 'string' ? DATA_URL_IMAGEM.exec(dataUrl) : null;
  if (!partes) {
    throw new HttpError(400, 'Envie uma imagem PNG, JPEG ou WebP');
  }
  const conteudo = Buffer.from(partes[2], 'base64');
  if (conteudo.length > TAMANHO_MAXIMO_IMAGEM) {
    throw new HttpError(400, 'Imagem muito grande (máximo de 2 MB)');
  }
  return { extensao: partes[1] === 'jpeg' ? 'jpg' : partes[1], conteudo };
}

// Grava a imagem com um nome gerado aqui (nunca um nome vindo do cliente) e devolve o
// caminho público dela.
export function salvarImagem(dataUrl: unknown): string {
  const { extensao, conteudo } = interpretarImagem(dataUrl);
  const arquivo = `${randomUUID()}.${extensao}`;
  if (ATIVA) {
    mkdirSync(DIRETORIO_IMAGENS, { recursive: true });
    writeFileSync(join(DIRETORIO_IMAGENS, arquivo), conteudo);
  }
  return `/imagens/${arquivo}`;
}

export function lerImagem(arquivo: string): { tipo: string; conteudo: Buffer } | null {
  if (!NOME_IMAGEM.test(arquivo)) {
    return null;
  }
  const caminho = join(DIRETORIO_IMAGENS, arquivo);
  if (!existsSync(caminho)) {
    return null;
  }
  return { tipo: TIPOS_IMAGEM[arquivo.split('.')[1]], conteudo: readFileSync(caminho) };
}
