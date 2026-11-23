// Módulo de leitura NFC (tier Intermediário, opcional): um celular ligado ao notebook por
// USB-C lê cartões NFC e o item do cartão entra no carrinho do totem.
// Consumido por: apps/api/src/modules/nfc, apps/totem (leitor, totem e aba do Administrador).
//
// Modo híbrido: o cartão diz o item de dois jeitos, nesta ordem:
// 1. código gravado no cartão, num registro de texto `totem-item:<id do item>` —
//    regravável à vontade (o cartão que era suco vira sorvete);
// 2. número de série cadastrado na área restrita — para cartões que não aceitam gravação
//    (ex.: cartões de evento com senhas próprias).

// O prefixo `totem-item:` é definido em cada app (este pacote só tem tipos).

// Cartão travado, ligado a um item pelo número de série (formato aa:bb:cc:dd).
export interface CartaoNfc {
  numeroSerie: string;
  itemCardapioId: string;
  cadastradoEm: string;
}

// O que o leitor (celular) manda a cada cartão aproximado.
export interface LeituraNfc {
  numeroSerie?: string;
  textos?: string[]; // registros de texto do cartão, se houver
}

export type ResultadoLeituraNfc =
  | { tipo: 'item'; itemCardapioId: string; nome: string; origem: 'codigo' | 'cadastro' }
  | { tipo: 'cadastrado'; itemCardapioId: string; nome: string; numeroSerie: string }
  | { tipo: 'desconhecido'; motivo: string }
  | { tipo: 'repetido' };

// O que o totem recebe ao vivo (Server-Sent Events em /nfc/eventos).
export type EventoNfc =
  | { tipo: 'estado'; leitorAtivo: boolean }
  | { tipo: 'item'; itemCardapioId: string; nome: string }
  | { tipo: 'desconhecido'; motivo: string };

// Cadastro de cartão travado: o Administrador escolhe o item e aproxima o cartão do
// leitor dentro do prazo.
export interface CadastroNfcPendente {
  itemCardapioId: string;
  expiraEm: string;
  // Preenchido quando o cartão foi aproximado.
  concluido?: CartaoNfc;
  // O cartão tinha um código gravado, que vale mais que o cadastro.
  aviso?: string;
}
