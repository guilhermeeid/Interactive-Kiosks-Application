import type { TermoConsentimento } from '@totem/shared';
import { CodigoQr } from './CodigoQr';
import { Modal } from './Modal';

// Item 4: os Termos e Condições completos, com um QR Code para o cliente abrir e ler no
// próprio celular. O QR leva ao endereço que o administrador informou ou, sem ele, à
// página de termos servida pela API.
export function TermosModal({
  termo,
  url,
  aoFechar,
}: {
  termo: TermoConsentimento;
  url: string;
  aoFechar: () => void;
}) {
  return (
    <Modal titulo="Termos e Condições" aoFechar={aoFechar}>
      <div className="termos">
        <div className="termos__qr">
          <CodigoQr texto={url} rotulo="QR Code dos Termos e Condições" />
          <p>Aponte a câmera do celular para ler no seu aparelho.</p>
        </div>
        <div className="termos__texto">
          {termo.secoes.map((secao) => (
            <section key={secao.titulo}>
              <h3>{secao.titulo}</h3>
              {secao.paragrafos.map((paragrafo) => (
                <p key={paragrafo}>{paragrafo}</p>
              ))}
            </section>
          ))}
          <p className="termos__versao">Versão {termo.versao}</p>
        </div>
      </div>
    </Modal>
  );
}
