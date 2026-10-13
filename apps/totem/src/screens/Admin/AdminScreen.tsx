import { useEffect, useState } from 'react';
import type { ConfigTotem } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import { criarAdminApi, type AdminApi } from '../../services/adminApi';
import { buscarConfig } from '../../services/apiClient';
import { AbaAparencia } from './AbaAparencia';
import { AbaCardapio } from './AbaCardapio';
import { AbaCupons } from './AbaCupons';
import { AbaFidelidade } from './AbaFidelidade';
import { AbaPagamento } from './AbaPagamento';
import { AbaPedidos } from './AbaPedidos';
import { AbaPrivacidade } from './AbaPrivacidade';
import { MensagemRetorno, useAcao, type PropsAba } from './comum';
import './admin.css';

const ABAS = [
  { id: 'aparencia', rotulo: 'Aparência', Aba: AbaAparencia },
  { id: 'cardapio', rotulo: 'Cardápio', Aba: AbaCardapio },
  { id: 'fidelidade', rotulo: 'Fidelidade', Aba: AbaFidelidade },
  { id: 'pagamento', rotulo: 'Pagamento', Aba: AbaPagamento },
  { id: 'cupons', rotulo: 'Cupons', Aba: AbaCupons },
  { id: 'pedidos', rotulo: 'Pedidos', Aba: AbaPedidos },
  { id: 'privacidade', rotulo: 'Privacidade', Aba: AbaPrivacidade },
] satisfies { id: string; rotulo: string; Aba: (props: PropsAba) => JSX.Element }[];

// Tela de administrador do totem (endereço /admin): o restaurante define aqui a
// aparência, o cardápio, a fidelidade, as formas de pagamento e os cupons, confirma a
// entrega dos pedidos e consulta a auditoria do consentimento. Protegida por PIN; não
// aplica o tema do totem em si mesma, para uma escolha de cor ruim nunca deixá-la ilegível.
export function AdminScreen() {
  const [api, setApi] = useState<AdminApi | null>(null);

  if (!api) {
    return <EntradaAdmin aoEntrar={setApi} />;
  }
  return <PainelAdmin api={api} aoSair={() => setApi(null)} />;
}

function EntradaAdmin({ aoEntrar }: { aoEntrar: (api: AdminApi) => void }) {
  const [pin, setPin] = useState('');
  const { retorno, ocupado, executar } = useAcao();

  async function entrar() {
    const api = criarAdminApi(pin);
    if (await executar(() => api.conferirPin())) {
      aoEntrar(api);
    } else {
      setPin('');
    }
  }

  return (
    <div className="admin admin--entrada">
      <form
        className="cartao"
        onSubmit={(evento) => {
          evento.preventDefault();
          entrar();
        }}
      >
        <h1>Administração do totem</h1>
        <p>Digite o PIN de administrador.</p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(evento) => setPin(evento.target.value)}
          aria-label="PIN de administrador"
        />
        <TecladoNumerico valor={pin} onChange={setPin} tamanhoMaximo={12} />
        <MensagemRetorno retorno={retorno} />
        <BotaoTouch type="submit" variante="primario" disabled={!pin || ocupado}>
          Entrar
        </BotaoTouch>
      </form>
    </div>
  );
}

function PainelAdmin({ api, aoSair }: { api: AdminApi; aoSair: () => void }) {
  const [config, setConfig] = useState<ConfigTotem | null>(null);
  const [abaAtual, setAbaAtual] = useState<string>(ABAS[0].id);
  const { retorno, executar } = useAcao();

  useEffect(() => {
    executar(async () => setConfig(await buscarConfig()));
  }, [executar]);

  async function salvarConfig(nova: ConfigTotem): Promise<ConfigTotem> {
    const salva = await api.salvarConfig(nova);
    setConfig(salva);
    return salva;
  }

  const { Aba } = ABAS.find((aba) => aba.id === abaAtual) ?? ABAS[0];

  return (
    <div className="admin">
      <header className="admin__topo">
        <h1>Administração do totem</h1>
        <div className="admin__topo-acoes">
          <a href="/" target="_blank" rel="noreferrer">
            Abrir o totem
          </a>
          <BotaoTouch onClick={aoSair}>Sair</BotaoTouch>
        </div>
      </header>

      <nav className="admin__abas" aria-label="Seções da administração">
        {ABAS.map((aba) => (
          <BotaoTouch
            key={aba.id}
            variante={aba.id === abaAtual ? 'destaque' : 'padrao'}
            onClick={() => setAbaAtual(aba.id)}
          >
            {aba.rotulo}
          </BotaoTouch>
        ))}
      </nav>

      <MensagemRetorno retorno={retorno} />
      {config && <Aba api={api} config={config} salvarConfig={salvarConfig} />}
    </div>
  );
}
