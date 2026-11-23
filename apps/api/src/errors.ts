// Erro HTTP simples usado pelos módulos de negócio. O Fastify já usa a propriedade
// `statusCode` de um erro lançado para definir o status da resposta automaticamente,
// então basta lançar HttpError dentro de um service — nenhuma camada extra é
// necessária nas rotas.
// `code` (opcional) vai junto na resposta, para a tela distinguir um caso específico
// (ex.: pedir confirmação antes de repetir a ação).
export class HttpError extends Error {
  statusCode: number;
  code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
