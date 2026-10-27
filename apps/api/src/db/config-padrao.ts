import type { ConfigTotem, PaginaTotem, TextoPagina } from '@totem/shared';

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
        inicio: { titulo: 'Toque para começar', descricao: '' },
        fidelidade: {
          titulo: 'Programa de fidelidade',
          descricao: 'Informe seu CPF para usar e acumular pontos, ou pule esta etapa.',
        },
        cardapio: { titulo: 'Cardápio', descricao: 'Escolha seus favoritos e monte seu pedido.' },
        carrinho: { titulo: 'Carrinho', descricao: 'Confira seu pedido, use cupom ou pontos.' },
        pagamento: { titulo: 'Pagamento', descricao: 'Como você prefere pagar?' },
        comprovante: {
          titulo: 'Comprovante',
          descricao: 'Como você quer receber seu comprovante?',
        },
      },
      publicidade: { imagens: [], segundosPorImagem: 6 },
    },
    categorias: [
      { id: 'lanches', nome: 'Lanches', icone: '🍔' },
      { id: 'acompanhamentos', nome: 'Acompanhamentos', icone: '🍟' },
      { id: 'bebidas', nome: 'Bebidas', icone: '🥤' },
      { id: 'sobremesas', nome: 'Sobremesas', icone: '🍨' },
    ],
    posicaoCategorias: 'esquerda',
    exibirTodos: true,
    fidelidade: {
      habilitado: true,
      acumuloHabilitado: true,
      percentualAcumulo: 5,
      pontosPorReal: 100,
      combinaComCupom: true,
    },
    // Vale-alimentação vem desligado: é o cartão de supermercado; restaurante costuma
    // aceitar vale-refeição. O administrador liga se a credenciadora aceitar os dois.
    formasPagamento: {
      credito: true,
      debito: true,
      pix: true,
      vale_refeicao: true,
      vale_alimentacao: false,
      dinheiro: true,
    },
    consumo: { local: true, viagem: true },
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
  // Só as páginas que ainda existem no fluxo (versões antigas tinham "identificacao").
  const paginasSalvas = salva.aparencia?.paginas ?? {};
  const paginas = Object.fromEntries(
    (Object.keys(padrao.aparencia.paginas) as PaginaTotem[]).map((pagina) => [
      pagina,
      {
        ...padrao.aparencia.paginas[pagina],
        ...(paginasSalvas as Record<string, TextoPagina>)[pagina],
      },
    ]),
  ) as Record<PaginaTotem, TextoPagina>;

  return {
    ...padrao,
    ...salva,
    aparencia: {
      ...padrao.aparencia,
      ...salva.aparencia,
      paginas,
      publicidade: { ...padrao.aparencia.publicidade, ...salva.aparencia?.publicidade },
    },
    fidelidade: { ...padrao.fidelidade, ...salva.fidelidade },
    formasPagamento: { ...padrao.formasPagamento, ...salva.formasPagamento },
    consumo: { ...padrao.consumo, ...salva.consumo },
  };
}
