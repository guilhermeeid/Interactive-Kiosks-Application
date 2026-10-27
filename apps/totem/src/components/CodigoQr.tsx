import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// QR Code de um texto (endereço dos Termos, código de cupom, cartão de fidelidade),
// gerado no próprio navegador, sem serviço externo.
export function CodigoQr({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [imagem, setImagem] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    QRCode.toDataURL(texto, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
      .then((url) => ativo && setImagem(url))
      .catch(() => ativo && setImagem(null));
    return () => {
      ativo = false;
    };
  }, [texto]);

  return imagem ? (
    <img className="codigo-qr" src={imagem} alt={rotulo} />
  ) : (
    <div className="codigo-qr codigo-qr--carregando" aria-label={rotulo} />
  );
}
