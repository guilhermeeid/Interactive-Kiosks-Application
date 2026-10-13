import type { ConfigTotem } from '@totem/shared';

// Configuração de fábrica do totem: reproduz a identidade visual e os textos que antes
// eram fixos no código. O administrador altera tudo pela tela /admin.
export function criarConfigPadrao(): ConfigTotem {
  return {
    aparencia: {
      nomeEstabelecimento: 'Peça Aqui',
      slogan: 'Autoatendimento — rápido e do seu jeito',
      logoEmoji: '🍔',
      fonteNome: 'Fredoka',
      fonteTextos: 'Nunito',
      corNome: '#ffffff',
      corFundo: '#fff6e9',
      corBarra: '#d62828',
      paginas: {
        cardapio: { titulo: 'Cardápio', descricao: 'Escolha seus favoritos e monte seu pedido.' },
        carrinho: { titulo: 'Carrinho', descricao: 'Confira seu pedido antes de continuar.' },
        identificacao: {
          titulo: 'Identificação (opcional)',
          descricao: 'Informe seu CPF ou pule esta etapa.',
        },
        pagamento: { titulo: 'Pagamento', descricao: 'Como você prefere pagar?' },
        comprovante: {
          titulo: 'Comprovante',
          descricao: 'Como você quer receber seu comprovante?',
        },
      },
    },
    categorias: [
      { id: 'lanches', nome: 'Lanches', icone: '🍔' },
      { id: 'acompanhamentos', nome: 'Acompanhamentos', icone: '🍟' },
      { id: 'bebidas', nome: 'Bebidas', icone: '🥤' },
      { id: 'sobremesas', nome: 'Sobremesas', icone: '🍨' },
    ],
    exibirTodos: true,
    fidelidade: {
      habilitado: true,
      acumuloHabilitado: true,
      percentualAcumulo: 5,
      pontosPorReal: 100,
      combinaComCupom: true,
    },
    formasPagamento: { credito: true, debito: true, pix: true },
    cuponsHabilitados: true,
  };
}

// Completa uma configuração salva por uma versão anterior com os campos que ela ainda
// não tinha, para o arquivo de dados continuar valendo depois de uma atualização.
export function mesclarConfig(salva?: Partial<ConfigTotem>): ConfigTotem {
  const padrao = criarConfigPadrao();
  if (!salva) {
    return padrao;
  }
  return {
    ...padrao,
    ...salva,
    aparencia: {
      ...padrao.aparencia,
      ...salva.aparencia,
      paginas: { ...padrao.aparencia.paginas, ...salva.aparencia?.paginas },
    },
    fidelidade: { ...padrao.fidelidade, ...salva.fidelidade },
    formasPagamento: { ...padrao.formasPagamento, ...salva.formasPagamento },
  };
}
