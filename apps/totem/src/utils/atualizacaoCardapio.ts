// Item 7 / US 34: de quanto em quanto tempo o totem relê o cardápio (o que o modo
// Funcionário muda: esgotado, preço, foto e descrição) e confere se o servidor foi
// reiniciado (quando entram em vigor as mudanças do modo Administrador).
export const INTERVALO_ATUALIZACAO_CARDAPIO_MS = 30_000;

// Para os avisos da área restrita.
export const PRAZO_ATUALIZACAO_CARDAPIO = `${INTERVALO_ATUALIZACAO_CARDAPIO_MS / 1000} segundos`;
