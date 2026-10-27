import { useEffect, useState, type CSSProperties } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { usePedido } from '../../contexts/PedidoContext';
import { urlImagem } from '../../services/apiClient';

// Tela 0 — "Toque para começar" (item 10). Enquanto ninguém usa o totem, passam as
// imagens de publicidade cadastradas pelo administrador; as bolinhas mostram em qual
// imagem está e quanto falta para a próxima. A barra inferior fica fixa. Tocar em
// qualquer lugar começa o pedido.
export function InicioScreen() {
  const { aparencia, fidelidade } = useConfig();
  const { irParaEtapa } = usePedido();
  const { imagens, segundosPorImagem } = aparencia.publicidade;
  const [atual, setAtual] = useState(0);

  useEffect(() => {
    if (imagens.length < 2) return;
    const espera = window.setTimeout(
      () => setAtual((indice) => (indice + 1) % imagens.length),
      segundosPorImagem * 1000,
    );
    return () => window.clearTimeout(espera);
  }, [atual, imagens.length, segundosPorImagem]);

  const comecar = () => irParaEtapa(fidelidade.habilitado ? 'fidelidade' : 'cardapio');
  const { titulo, descricao } = aparencia.paginas.inicio;

  return (
    <button type="button" className="inicio" onClick={comecar} aria-label={titulo}>
      <div className="inicio__vitrine">
        {imagens.length > 0 ? (
          imagens.map((imagem, indice) => (
            <img
              key={imagem}
              className={
                indice === atual ? 'inicio__anuncio inicio__anuncio--ativo' : 'inicio__anuncio'
              }
              src={urlImagem(imagem)}
              alt=""
            />
          ))
        ) : (
          // Sem publicidade cadastrada: a marca da loja ocupa a vitrine.
          <div className="inicio__marca">
            <span className="inicio__marca-logo" aria-hidden="true">
              {aparencia.logoImagemUrl ? (
                <img src={urlImagem(aparencia.logoImagemUrl)} alt="" />
              ) : (
                aparencia.logoEmoji
              )}
            </span>
            <strong>{aparencia.nomeEstabelecimento}</strong>
            <span>{aparencia.slogan}</span>
          </div>
        )}

        {imagens.length > 0 && (
          <span className="inicio__logo" aria-hidden="true">
            {aparencia.logoImagemUrl ? (
              <img src={urlImagem(aparencia.logoImagemUrl)} alt="" />
            ) : (
              aparencia.logoEmoji
            )}
          </span>
        )}

        {imagens.length > 1 && (
          <div className="inicio__bolinhas" aria-hidden="true">
            {imagens.map((imagem, indice) => (
              <span
                key={`${imagem}-${indice === atual ? atual : 'parada'}`}
                className={indice === atual ? 'bolinha bolinha--ativa' : 'bolinha'}
                style={{ '--duracao': `${segundosPorImagem}s` } as CSSProperties}
              />
            ))}
          </div>
        )}
      </div>

      <div className="inicio__barra">
        <strong>{titulo}</strong>
        {descricao && <span>{descricao}</span>}
      </div>
    </button>
  );
}
