// Erro HTTP simples usado pelos módulos de negócio. O Fastify já usa a propriedade
// `statusCode` de um erro lançado para definir o status da resposta automaticamente,
// então basta lançar HttpError dentro de um service — nenhuma camada extra é
// necessária nas rotas.
export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
