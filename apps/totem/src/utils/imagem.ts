// Reduz no navegador a imagem escolhida pelo administrador (foto de item ou logotipo)
// antes do envio, para ela caber no espaço do totem e não pesar no carregamento.
// Devolve um data URL pronto para a rota POST /admin/imagens.
export async function redimensionarImagem(arquivo: File, ladoMaximo: number): Promise<string> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);

  const contexto = canvas.getContext('2d');
  if (!contexto) {
    throw new Error('Este navegador não consegue preparar a imagem');
  }
  // PNG mantém a transparência (comum em logotipos); o resto vira JPEG, bem menor,
  // sobre fundo branco.
  const png = arquivo.type === 'image/png';
  if (!png) {
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
  }
  contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85);
}
