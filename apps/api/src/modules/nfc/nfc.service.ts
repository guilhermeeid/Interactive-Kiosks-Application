import type {
  CadastroNfcPendente,
  CartaoNfc,
  EventoNfc,
  LeituraNfc,
  ResultadoLeituraNfc,
} from '@totem/shared';
import { cartoesNfc, obterItem, persistir } from '../../db/memory-store';
import { HttpError } from '../../errors';

// Módulo de leitura NFC (tier Intermediário, opcional). Um celular ligado ao notebook por
// USB-C (`adb reverse`) lê os cartões e manda a leitura para cá; o item vai para a tela
// do totem por Server-Sent Events, e é o totem quem o põe no carrinho — pelo mesmo
// caminho do toque na tela, com as mesmas regras de estoque e disponibilidade. Nada do
// carrinho, do pagamento ou do cardápio depende deste módulo.
//
// Modo híbrido: vale primeiro o código gravado no cartão (`totem-item:<id>`, regravável);
// sem código, o número de série cadastrado na área restrita (cartões travados).

export const PREFIXO_CODIGO_NFC = 'totem-item:';
const PRAZO_CADASTRO_MS = 60_000;
// O leitor manda um sinal a cada poucos segundos; sem sinal por este tempo, o totem
// deixa de mostrar o NFC como ativo.
const SINAL_VALIDO_MS = 15_000;
// O mesmo cartão encostado de novo dentro deste tempo conta uma vez só.
const INTERVALO_REPETICAO_MS = 2_000;

type Ouvinte = (evento: EventoNfc) => void;
const ouvintes = new Set<Ouvinte>();
let ultimoSinal = 0;
let estadoAnunciado = false;
let cadastro: CadastroNfcPendente | null = null;
const ultimasLeituras = new Map<string, number>();

function emitir(evento: EventoNfc): void {
  for (const ouvinte of ouvintes) {
    ouvinte(evento);
  }
}

// O totem acompanha as leituras e o estado do leitor por aqui. Devolve a função que
// cancela a assinatura.
export function assinarEventos(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function leitorAtivo(agora = Date.now()): boolean {
  return agora - ultimoSinal < SINAL_VALIDO_MS;
}

// Anuncia ao totem quando o leitor liga ou desliga (sem sinal por 15 s).
export function verificarLeitor(agora = Date.now()): void {
  const ativo = leitorAtivo(agora);
  if (ativo !== estadoAnunciado) {
    estadoAnunciado = ativo;
    emitir({ tipo: 'estado', leitorAtivo: ativo });
  }
  for (const [chave, quando] of ultimasLeituras) {
    if (agora - quando > INTERVALO_REPETICAO_MS) ultimasLeituras.delete(chave);
  }
}

export function registrarSinal(agora = Date.now()): void {
  ultimoSinal = agora;
  verificarLeitor(agora);
}

// Aceita "E6:D2:A0:CA", "e6d2a0ca" ou "e6-d2-a0-ca" e devolve "e6:d2:a0:ca". Números de
// série NFC têm 4, 7 ou 10 bytes.
export function normalizarNumeroSerie(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const hex = valor.toLowerCase().replace(/[^0-9a-f]/g, '');
  if (![8, 14, 20].includes(hex.length)) return undefined;
  return hex.match(/../g)?.join(':');
}

function codigoGravado(textos: string[]): string | undefined {
  const texto = textos.find((t) => t.trim().startsWith(PREFIXO_CODIGO_NFC));
  return texto?.trim().slice(PREFIXO_CODIGO_NFC.length).trim() || undefined;
}

function nomeDoItem(id: string): string | undefined {
  return obterItem(id)?.nome;
}

// Uma leitura do celular. Durante um cadastro, o cartão é ligado ao item escolhido pelo
// Administrador em vez de ir para o carrinho.
export function processarLeitura(
  entrada: LeituraNfc | undefined,
  agora = Date.now(),
): ResultadoLeituraNfc {
  registrarSinal(agora);
  const numeroSerie = normalizarNumeroSerie(entrada?.numeroSerie);
  const textos = Array.isArray(entrada?.textos)
    ? entrada.textos.filter((t): t is string => typeof t === 'string').slice(0, 10)
    : [];
  const codigo = codigoGravado(textos);
  if (!numeroSerie && !codigo) {
    throw new HttpError(400, 'Leitura sem número de série nem código de item');
  }

  if (cadastro && !cadastro.concluido && Date.parse(cadastro.expiraEm) > agora) {
    if (!numeroSerie) {
      throw new HttpError(400, 'O leitor não informou o número de série deste cartão');
    }
    const nome = nomeDoItem(cadastro.itemCardapioId);
    if (!nome) {
      cadastro = null;
      throw new HttpError(409, 'O item escolhido não existe mais no cardápio');
    }
    const cartao: CartaoNfc = {
      numeroSerie,
      itemCardapioId: cadastro.itemCardapioId,
      cadastradoEm: new Date(agora).toISOString(),
    };
    cartoesNfc.set(numeroSerie, cartao);
    persistir();
    cadastro.concluido = cartao;
    if (codigo) {
      cadastro.aviso =
        `Este cartão tem gravado o código de "${nomeDoItem(codigo) ?? codigo}", que vale ` +
        'mais que o cadastro. Regrave o cartão para usar o cadastro.';
    }
    return { tipo: 'cadastrado', itemCardapioId: cartao.itemCardapioId, nome, numeroSerie };
  }

  const chave = numeroSerie ?? `codigo:${codigo}`;
  if (agora - (ultimasLeituras.get(chave) ?? -Infinity) < INTERVALO_REPETICAO_MS) {
    return { tipo: 'repetido' };
  }
  ultimasLeituras.set(chave, agora);

  const itemId = codigo ?? (numeroSerie ? cartoesNfc.get(numeroSerie)?.itemCardapioId : undefined);
  if (!itemId) {
    // Número de série desconhecido não é guardado nem registrado: pode ser um cartão do
    // cliente (transporte, crachá), não da loja.
    const motivo = 'Cartão não reconhecido. Use um cartão do cardápio.';
    emitir({ tipo: 'desconhecido', motivo });
    return { tipo: 'desconhecido', motivo };
  }
  const nome = nomeDoItem(itemId);
  if (!nome) {
    const motivo = 'O item deste cartão não está mais no cardápio.';
    emitir({ tipo: 'desconhecido', motivo });
    return { tipo: 'desconhecido', motivo };
  }
  emitir({ tipo: 'item', itemCardapioId: itemId, nome });
  return { tipo: 'item', itemCardapioId: itemId, nome, origem: codigo ? 'codigo' : 'cadastro' };
}

// ---------- Área restrita: cartões travados ----------

export type CartaoNfcComItem = CartaoNfc & { nomeItem?: string };

export async function listarCartoes(): Promise<CartaoNfcComItem[]> {
  return [...cartoesNfc.values()]
    .map((cartao) => ({ ...cartao, nomeItem: nomeDoItem(cartao.itemCardapioId) }))
    .sort((a, b) => b.cadastradoEm.localeCompare(a.cadastradoEm));
}

export async function removerCartao(numeroSerie: string): Promise<void> {
  const chave = normalizarNumeroSerie(numeroSerie);
  if (!chave || !cartoesNfc.delete(chave)) {
    throw new HttpError(404, 'Cartão não encontrado');
  }
  persistir();
}

// O próximo cartão aproximado do leitor (em até 60 s) fica ligado a este item.
export async function iniciarCadastro(
  itemCardapioId: unknown,
  agora = Date.now(),
): Promise<CadastroNfcPendente> {
  if (typeof itemCardapioId !== 'string' || !obterItem(itemCardapioId)) {
    throw new HttpError(400, 'Escolha um item do cardápio em vigor');
  }
  if (!leitorAtivo(agora)) {
    throw new HttpError(
      409,
      'O leitor NFC não está conectado. Abra a página do leitor no celular.',
    );
  }
  cadastro = { itemCardapioId, expiraEm: new Date(agora + PRAZO_CADASTRO_MS).toISOString() };
  return cadastro;
}

export async function obterCadastro(): Promise<CadastroNfcPendente | null> {
  return cadastro;
}

export async function cancelarCadastro(): Promise<void> {
  cadastro = null;
}

// Só para os testes.
export function reiniciarNfc(): void {
  ouvintes.clear();
  ultimoSinal = 0;
  estadoAnunciado = false;
  cadastro = null;
  ultimasLeituras.clear();
}
