import type { AparenciaTotem } from '@totem/shared';
import { urlImagem } from '../services/apiClient';

// Cabeçalho fixo com a marca da loja, exibido em todas as telas do totem. Nome, frase,
// logotipo e cores são definidos pelo administrador em /admin.
export function Cabecalho({ aparencia }: { aparencia: AparenciaTotem }) {
  return (
    <header className="cabecalho">
      <div className="cabecalho__conteudo">
        <span className="cabecalho__logo" aria-hidden="true">
          {aparencia.logoImagemUrl ? (
            <img src={urlImagem(aparencia.logoImagemUrl)} alt="" />
          ) : (
            aparencia.logoEmoji
          )}
        </span>
        <div>
          <span className="cabecalho__nome">{aparencia.nomeEstabelecimento}</span>
          <span className="cabecalho__slogan">{aparencia.slogan}</span>
        </div>
      </div>
    </header>
  );
}
