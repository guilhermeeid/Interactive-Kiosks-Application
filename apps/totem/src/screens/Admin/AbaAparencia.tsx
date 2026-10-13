import { useState, type CSSProperties } from 'react';
import type { AparenciaTotem, PaginaTotem } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { Cabecalho } from '../../components/Cabecalho';
import { urlImagem } from '../../services/apiClient';
import { redimensionarImagem } from '../../utils/imagem';
import { variaveisDoTema } from '../../utils/tema';
import { Campo, MensagemRetorno, SALVO_AGUARDA_REINICIO, useAcao, type PropsAba } from './comum';

// As fontes ficam salvas na configuração, mas o totem ainda não as aplica.
const FONTES = [
  'Fredoka',
  'Nunito',
  'Poppins',
  'Montserrat',
  'Roboto',
  'Baloo 2',
  'Lora',
  'Playfair Display',
];

const PAGINAS: { id: PaginaTotem; rotulo: string }[] = [
  { id: 'cardapio', rotulo: 'Cardápio' },
  { id: 'carrinho', rotulo: 'Carrinho' },
  { id: 'identificacao', rotulo: 'Identificação' },
  { id: 'pagamento', rotulo: 'Pagamento' },
  { id: 'comprovante', rotulo: 'Comprovante' },
];

const COR_HEX = /^#[0-9a-f]{6}$/i;
// Lado máximo do logotipo: sobra para o círculo de 3,25rem do cabeçalho em tela densa.
const LADO_LOGO = 160;

function CampoCor({
  rotulo,
  dica,
  valor,
  aoMudar,
}: {
  rotulo: string;
  dica?: string;
  valor: string;
  aoMudar: (valor: string) => void;
}) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      <span className="admin-cor">
        <input
          type="color"
          value={COR_HEX.test(valor) ? valor : '#000000'}
          onChange={(evento) => aoMudar(evento.target.value)}
          aria-label={`${rotulo}: seletor`}
        />
        <input
          type="text"
          value={valor}
          maxLength={7}
          placeholder="#rrggbb"
          onChange={(evento) => aoMudar(evento.target.value.trim())}
        />
      </span>
    </Campo>
  );
}

export function AbaAparencia({ api, config, salvarConfig }: PropsAba) {
  const [rascunho, setRascunho] = useState<AparenciaTotem>(config.aparencia);
  const { retorno, ocupado, executar } = useAcao();

  const alterar = (parcial: Partial<AparenciaTotem>) =>
    setRascunho((atual) => ({ ...atual, ...parcial }));
  const alterarPagina = (pagina: PaginaTotem, campo: 'titulo' | 'descricao', valor: string) =>
    setRascunho((atual) => ({
      ...atual,
      paginas: { ...atual.paginas, [pagina]: { ...atual.paginas[pagina], [campo]: valor } },
    }));

  const enviarLogo = (arquivo: File) =>
    executar(async () => {
      const { url } = await api.enviarImagem(await redimensionarImagem(arquivo, LADO_LOGO));
      alterar({ logoImagemUrl: url });
    });

  const salvar = () =>
    executar(async () => {
      const salva = await salvarConfig({ ...config, aparencia: rascunho });
      setRascunho(salva.aparencia);
    }, SALVO_AGUARDA_REINICIO);

  // A prévia usa a última cor válida enquanto o administrador ainda digita o hex.
  const corDaPrevia = (campo: 'corFundo' | 'corBarra' | 'corNome') =>
    COR_HEX.test(rascunho[campo]) ? rascunho[campo] : config.aparencia[campo];
  const tema = variaveisDoTema({
    corFundo: corDaPrevia('corFundo'),
    corBarra: corDaPrevia('corBarra'),
    corNome: corDaPrevia('corNome'),
  });

  return (
    <form
      className="admin-secao"
      onSubmit={(evento) => {
        evento.preventDefault();
        salvar();
      }}
    >
      <h2>Prévia</h2>
      <div className="admin-previa" style={tema as CSSProperties}>
        <Cabecalho aparencia={rascunho} />
        <div className="admin-previa__fundo">
          <strong className="tela__titulo">{rascunho.paginas.cardapio.titulo}</strong>
          <p className="tela__subtitulo">{rascunho.paginas.cardapio.descricao}</p>
          <BotaoTouch variante="primario">Adicionar</BotaoTouch>
        </div>
      </div>

      <h2>Identidade</h2>
      <div className="admin-grade">
        <Campo rotulo="Nome do estabelecimento">
          <input
            type="text"
            value={rascunho.nomeEstabelecimento}
            maxLength={40}
            onChange={(evento) => alterar({ nomeEstabelecimento: evento.target.value })}
          />
        </Campo>
        <Campo rotulo="Frase abaixo do nome">
          <input
            type="text"
            value={rascunho.slogan}
            maxLength={80}
            onChange={(evento) => alterar({ slogan: evento.target.value })}
          />
        </Campo>
        <Campo rotulo="Fonte do nome do estabelecimento">
          <select
            value={rascunho.fonteNome}
            onChange={(evento) => alterar({ fonteNome: evento.target.value })}
          >
            {FONTES.map((fonte) => (
              <option key={fonte}>{fonte}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Fonte dos demais textos">
          <select
            value={rascunho.fonteTextos}
            onChange={(evento) => alterar({ fonteTextos: evento.target.value })}
          >
            {FONTES.map((fonte) => (
              <option key={fonte}>{fonte}</option>
            ))}
          </select>
        </Campo>
      </div>

      <h2>Logotipo</h2>
      <div className="admin-logo">
        <span className="cabecalho__logo" aria-hidden="true">
          {rascunho.logoImagemUrl ? (
            <img src={urlImagem(rascunho.logoImagemUrl)} alt="" />
          ) : (
            rascunho.logoEmoji
          )}
        </span>
        <Campo rotulo="Emoji" dica="Usado quando não há imagem.">
          <input
            type="text"
            value={rascunho.logoEmoji}
            maxLength={8}
            onChange={(evento) => alterar({ logoEmoji: evento.target.value })}
          />
        </Campo>
        <Campo rotulo="Imagem" dica="É reduzida e recortada para caber no círculo.">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) enviarLogo(arquivo);
              evento.target.value = '';
            }}
          />
        </Campo>
        {rascunho.logoImagemUrl && (
          <BotaoTouch variante="perigo" onClick={() => alterar({ logoImagemUrl: undefined })}>
            Voltar ao emoji
          </BotaoTouch>
        )}
      </div>

      <h2>Cores</h2>
      <p className="admin-dica">
        Você escolhe estas três; as cores dos demais textos e detalhes são ajustadas
        sozinhas para contrastar com o fundo e com a barra.
      </p>
      <div className="admin-grade">
        <CampoCor
          rotulo="Cor do nome do estabelecimento"
          valor={rascunho.corNome}
          aoMudar={(corNome) => alterar({ corNome })}
        />
        <CampoCor
          rotulo="Cor do fundo"
          valor={rascunho.corFundo}
          aoMudar={(corFundo) => alterar({ corFundo })}
        />
        <CampoCor
          rotulo="Cor da barra do topo"
          dica="Também é a cor dos botões principais e dos preços."
          valor={rascunho.corBarra}
          aoMudar={(corBarra) => alterar({ corBarra })}
        />
      </div>

      <h2>Nome e descrição das páginas</h2>
      <div className="admin-lista">
        {PAGINAS.map(({ id, rotulo }) => (
          <div key={id} className="admin-linha admin-linha--pagina">
            <strong>{rotulo}</strong>
            <Campo rotulo="Nome">
              <input
                type="text"
                value={rascunho.paginas[id].titulo}
                maxLength={40}
                onChange={(evento) => alterarPagina(id, 'titulo', evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Descrição">
              <input
                type="text"
                value={rascunho.paginas[id].descricao}
                maxLength={120}
                onChange={(evento) => alterarPagina(id, 'descricao', evento.target.value)}
              />
            </Campo>
          </div>
        ))}
      </div>

      <MensagemRetorno retorno={retorno} />
      <BotaoTouch type="submit" variante="primario" disabled={ocupado}>
        Salvar aparência
      </BotaoTouch>
    </form>
  );
}
