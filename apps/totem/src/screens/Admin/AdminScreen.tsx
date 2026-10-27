import { useCallback, useEffect, useState } from 'react';
import type { ConfigTotem, PapelAcesso, ResumoPendencias } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { TecladoNumerico } from '../../components/TecladoNumerico';
import {
  conferirAcesso,
  criarAdminApi,
  criarFuncionarioApi,
  type AdminApi,
  type FuncionarioApi,
} from '../../services/adminApi';
import { AbaAparencia } from './AbaAparencia';
import { AbaCardapio } from './AbaCardapio';
import { AbaCupons } from './AbaCupons';
import { AbaFidelidade } from './AbaFidelidade';
import { AbaPagamento } from './AbaPagamento';
import { AbaPedidos } from './AbaPedidos';
import { AbaPrivacidade } from './AbaPrivacidade';
import { AbaProdutosAoVivo } from './AbaProdutosAoVivo';
import { MensagemRetorno, useAcao, type PropsAba, type PropsAbaFuncionario } from './comum';
import './admin.css';

const ABAS_ADMINISTRADOR = [
  { id: 'aparencia', rotulo: 'Aparência', Aba: AbaAparencia },
  { id: 'cardapio', rotulo: 'Cardápio', Aba: AbaCardapio },
  { id: 'fidelidade', rotulo: 'Fidelidade', Aba: AbaFidelidade },
  { id: 'pagamento', rotulo: 'Pagamento', Aba: AbaPagamento },
  { id: 'cupons', rotulo: 'Cupons', Aba: AbaCupons },
  { id: 'privacidade', rotulo: 'Privacidade', Aba: AbaPrivacidade },
] satisfies { id: string; rotulo: string; Aba: (props: PropsAba) => JSX.Element }[];

const ABAS_FUNCIONARIO = [
  { id: 'pedidos', rotulo: 'Pedidos', Aba: AbaPedidos },
  { id: 'produtos', rotulo: 'Produtos', Aba: AbaProdutosAoVivo },
] satisfies { id: string; rotulo: string; Aba: (props: PropsAbaFuncionario) => JSX.Element }[];

type Modo = PapelAcesso;

interface Sessao {
  papel: PapelAcesso;
  admin: AdminApi | null; // só existe para quem entrou com o PIN de Administrador
  funcionario: FuncionarioApi;
}

// Área restrita do totem (endereço /admin). Item 7: o PIN define o papel.
// - Administrador muda tudo, mas o que salva fica pendente e só entra em vigor quando o
//   servidor é reiniciado. Pode alternar para o modo Funcionário.
// - Funcionário marca itens como esgotados, troca preço, foto e descrição, e cuida dos
//   pedidos no caixa e no balcão; o que ele muda vale na hora.
// Não aplica o tema do totem em si mesma, para uma escolha de cor ruim nunca deixá-la
// ilegível.
export function AdminScreen() {
  const [sessao, setSessao] = useState<Sessao | null>(null);

  if (!sessao) {
    return <Entrada aoEntrar={setSessao} />;
  }
  return <Painel sessao={sessao} aoSair={() => setSessao(null)} />;
}

function Entrada({ aoEntrar }: { aoEntrar: (sessao: Sessao) => void }) {
  const [pin, setPin] = useState('');
  const { retorno, ocupado, executar } = useAcao();

  async function entrar() {
    let papel: PapelAcesso | null = null;
    const deuCerto = await executar(async () => {
      papel = (await conferirAcesso(pin)).papel;
    });
    if (deuCerto && papel) {
      aoEntrar({
        papel,
        admin: papel === 'administrador' ? criarAdminApi(pin) : null,
        funcionario: criarFuncionarioApi(pin),
      });
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
        <h1>Área restrita do totem</h1>
        <p>Digite o PIN de Administrador ou de Funcionário.</p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(evento) => setPin(evento.target.value)}
          aria-label="PIN"
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

function Painel({ sessao, aoSair }: { sessao: Sessao; aoSair: () => void }) {
  const [modo, setModo] = useState<Modo>(sessao.papel);
  const ehAdministrador = sessao.admin !== null;

  return (
    <div className="admin">
      <header className="admin__topo">
        <div>
          <h1>Área restrita do totem</h1>
          <small>
            {modo === 'administrador'
              ? 'Modo Administrador: o que você salvar entra em vigor quando o servidor for reiniciado.'
              : 'Modo Funcionário: o que você mudar vale na hora.'}
          </small>
        </div>
        <div className="admin__topo-acoes">
          {/* Só quem entrou como Administrador alterna os modos. */}
          {ehAdministrador && (
            <div className="admin__modos" role="group" aria-label="Modo">
              <BotaoTouch
                variante={modo === 'administrador' ? 'destaque' : 'padrao'}
                aria-pressed={modo === 'administrador'}
                onClick={() => setModo('administrador')}
              >
                Administrador
              </BotaoTouch>
              <BotaoTouch
                variante={modo === 'funcionario' ? 'destaque' : 'padrao'}
                aria-pressed={modo === 'funcionario'}
                onClick={() => setModo('funcionario')}
              >
                Funcionário
              </BotaoTouch>
            </div>
          )}
          <a href="/" target="_blank" rel="noreferrer">
            Abrir o totem
          </a>
          <BotaoTouch onClick={aoSair}>Sair</BotaoTouch>
        </div>
      </header>

      {modo === 'administrador' && sessao.admin ? (
        <PainelAdministrador api={sessao.admin} />
      ) : (
        <PainelFuncionario api={sessao.funcionario} />
      )}
    </div>
  );
}

function descreverPendencias(pendencias: ResumoPendencias): string {
  const partes = [
    pendencias.config && 'configuração',
    pendencias.produtos > 0 && `${pendencias.produtos} mudança(s) em produtos`,
    pendencias.cupons > 0 && `${pendencias.cupons} mudança(s) em cupons`,
  ].filter(Boolean);
  return partes.join(', ');
}

function PainelAdministrador({ api }: { api: AdminApi }) {
  const [config, setConfig] = useState<ConfigTotem | null>(null);
  const [pendencias, setPendencias] = useState<ResumoPendencias | null>(null);
  const [abaAtual, setAbaAtual] = useState<string>(ABAS_ADMINISTRADOR[0].id);
  // Muda quando as pendências são descartadas, para as abas recarregarem do servidor.
  const [geracao, setGeracao] = useState(0);
  const { retorno, executar } = useAcao();

  const atualizarPendencias = useCallback(() => {
    api
      .obterPendencias()
      .then(setPendencias)
      .catch(() => undefined);
  }, [api]);

  useEffect(() => {
    executar(async () => setConfig(await api.obterConfig()));
    atualizarPendencias();
  }, [api, executar, atualizarPendencias, geracao]);

  async function salvarConfig(nova: ConfigTotem): Promise<ConfigTotem> {
    const salva = await api.salvarConfig(nova);
    setConfig(salva);
    atualizarPendencias();
    return salva;
  }

  const descartar = () =>
    window.confirm(
      'Descartar todas as mudanças pendentes? Nada do que está pendente entrará em vigor.',
    ) &&
    executar(async () => {
      await api.descartarPendencias();
      setGeracao((atual) => atual + 1);
    }, 'Mudanças pendentes descartadas.');

  const { Aba } = ABAS_ADMINISTRADOR.find((aba) => aba.id === abaAtual) ?? ABAS_ADMINISTRADOR[0];
  const resumo = pendencias ? descreverPendencias(pendencias) : '';

  return (
    <>
      {resumo && (
        <div className="admin-pendencias" role="status">
          <p>
            <strong>Mudanças pendentes:</strong> {resumo}. Entram em vigor quando o servidor for
            reiniciado.
          </p>
          <BotaoTouch variante="perigo" onClick={descartar}>
            Descartar pendências
          </BotaoTouch>
        </div>
      )}

      <nav className="admin__abas" aria-label="Seções do modo Administrador">
        {ABAS_ADMINISTRADOR.map((aba) => (
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
      {config && (
        <Aba
          key={`${abaAtual}-${geracao}`}
          api={api}
          config={config}
          salvarConfig={salvarConfig}
          aoSalvar={atualizarPendencias}
        />
      )}
    </>
  );
}

function PainelFuncionario({ api }: { api: FuncionarioApi }) {
  const [abaAtual, setAbaAtual] = useState<string>(ABAS_FUNCIONARIO[0].id);
  const { Aba } = ABAS_FUNCIONARIO.find((aba) => aba.id === abaAtual) ?? ABAS_FUNCIONARIO[0];

  return (
    <>
      <nav className="admin__abas" aria-label="Seções do modo Funcionário">
        {ABAS_FUNCIONARIO.map((aba) => (
          <BotaoTouch
            key={aba.id}
            variante={aba.id === abaAtual ? 'destaque' : 'padrao'}
            onClick={() => setAbaAtual(aba.id)}
          >
            {aba.rotulo}
          </BotaoTouch>
        ))}
      </nav>
      <Aba key={abaAtual} api={api} />
    </>
  );
}
