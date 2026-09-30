// Cabeçalho fixo com a marca da loja, exibido em todas as telas do totem.
// Troque NOME_LOJA/SLOGAN pela identidade real do cliente.
const NOME_LOJA = 'Peça Aqui';
const SLOGAN = 'Autoatendimento — rápido e do seu jeito';

export function Cabecalho() {
  return (
    <header className="cabecalho">
      <div className="cabecalho__conteudo">
        <span className="cabecalho__logo" aria-hidden="true">
          🍔
        </span>
        <div>
          <span className="cabecalho__nome">{NOME_LOJA}</span>
          <span className="cabecalho__slogan">{SLOGAN}</span>
        </div>
      </div>
    </header>
  );
}
