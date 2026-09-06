// Barrel dos adapters de integração externa do tier Básico.
//
// Cada subpasta expõe uma interface (contrato) + uma implementação mock/stub, o que
// permite trocar de provedor sem alterar os módulos de negócio (src/modules).
//
// Esta pasta é o único lugar onde hardware/serviços externos podem ser acoplados.
// Tiers futuros (Intermediário: impressora térmica, leitor de QR/código de barras;
// Avançado: balança, RFID) devem ser adicionados como novas subpastas aqui
// (ex.: integrations/impressora/, integrations/rfid/), cada uma com sua própria
// interface + mock, sem jamais tocar em src/modules.

export * from './gateway-pagamento';
export * from './api-fiscal';
export * from './notificacao';
