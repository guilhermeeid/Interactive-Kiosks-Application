import { useCallback, useEffect, useState } from 'react';
import type {
  ConfigTotem,
  PapelAcesso,
  ResumoPendencias,
  SessaoPainel,
  UsuarioPainel,
} from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { TecladoVirtual } from '../../components/TecladoVirtual';
import {
  criarAdminApi,
  criarFuncionarioApi,
  criarSessaoApi,
  entrar,
  type AdminApi,
  type FuncionarioApi,
  type SessaoApi,
} from '../../services/adminApi';
import { AbaAparencia } from './AbaAparencia';
import { AbaCardapio } from './AbaCardapio';
import { AbaCupons } from './AbaCupons';
import { AbaFidelidade } from './AbaFidelidade';
import { AbaPagamento } from './AbaPagamento';
import { AbaPedidos } from './AbaPedidos';
import { AbaPrivacidade } from './AbaPrivacidade';
import { AbaProdutosAoVivo } from './AbaProdutosAoVivo';
import { AbaUsuarios } from './AbaUsuarios';
import { Campo, MensagemRetorno, useAcao, type PropsAba, type PropsAbaFuncionario } from './comum';
import './admin.css';

const ABAS_ADMINISTRADOR = [
  { id: 'aparencia', rotulo: 'Aparência', Aba: AbaAparencia },
  { id: 'cardapio', rotulo: 'Cardápio', Aba: AbaCardapio },
  { id: 'fidelidade', rotulo: 'Fidelidade', Aba: AbaFidelidade },
  { id: 'pagamento', rotulo: 'Pagamento', Aba: AbaPagamento },
  { id: 'cupons', rotulo: 'Cupons', Aba: AbaCupons },
  { id: 'privacidade', rotulo: 'Privacidade', Aba: AbaPrivacidade },
  { id: 'usuarios', rotulo: 'Usuários', Aba: AbaUsuarios },
] satisfies { id: string; rotulo: string; Aba: (props: PropsAba) => JSX.Element }[];

const ABAS_FUNCIONARIO = [
  { id: 'pedidos', rotulo: 'Pedidos', Aba: AbaPedidos },
  { id: 'produtos', rotulo: 'Produtos', Aba: AbaProdutosAoVivo },
] satisfies { id: string; rotulo: string; Aba: (props: PropsAbaFuncionario) => JSX.Element }[];

const NOME_PAPEL: Record<PapelAcesso, string> = {
  administrador: 'Administrador',
  funcionario: 'Funcionário',
};

// A tela avisa o servidor que o usuário está mexendo nela no máximo uma vez por minuto.
const INTERVALO_RENOVACAO_MS = 60_000;

type Modo = PapelAcesso;

interface Sessao {
  usuario: UsuarioPainel;
  inatividadeMaximaMinutos: number;
  sessaoApi: SessaoApi;
  admin: AdminApi | null; // só existe para quem tem o perfil Administrador
  funcionario: FuncionarioApi;
}

// Área restrita do totem (endereço /admin). Card E / US 35: entrada por usuário e senha;
// o perfil do usuário define o que ele vê.
// - Administrador muda tudo, mas o que salva fica pendente e só entra em vigor quando o
//   servidor é reiniciado. Pode alternar para o modo Funcionário e gerencia os usuários.
// - Funcionário marca itens como esgotados, troca preço, foto e descrição, e cuida dos
//   pedidos no caixa e no balcão; o que ele muda vale na hora.
// A sessão termina depois de 30 minutos sem ninguém mexer na tela (ou quando a API a
// recusa: senha trocada, usuário removido, servidor reiniciado).
// Não aplica o tema do totem em si mesma, para uma escolha de cor ruim nunca deixá-la
// ilegível.
export function AdminScreen() {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const encerrar = useCallback((motivo?: string) => {
    setSessao(null);
    setAviso(motivo ?? null);
  }, []);

  function abrirSessao(dados: SessaoPainel) {
    setAviso(null);
    setSessao({
      usuario: dados.usuario,
      inatividadeMaximaMinutos: dados.inatividadeMaximaMinutos,
      sessaoApi: criarSessaoApi(dados.token, encerrar),
      admin: dados.usuario.papel === 'administrador' ? criarAdminApi(dados.token, encerrar) : null,
      funcionario: criarFuncionarioApi(dados.token, encerrar),
    });
  }

  if (!sessao) {
    return <Entrada aviso={aviso} aoEntrar={abrirSessao} />;
  }
  return <Painel sessao={sessao} aoEncerrar={encerrar} />;
}

function Entrada({
  aviso,
  aoEntrar,
}: {
  aviso: string | null;
  aoEntrar: (sessao: SessaoPainel) => void;
}) {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  // Campo que o teclado virtual preenche (o totem pode não ter teclado físico).
  const [campo, setCampo] = useState<'login' | 'senha'>('login');
  const { retorno, ocupado, executar } = useAcao();

  async function enviar() {
    const resultado: { sessao?: SessaoPainel } = {};
    const deuCerto = await executar(async () => {
      resultado.sessao = await entrar(login, senha);
    });
    if (deuCerto && resultado.sessao) {
      aoEntrar(resultado.sessao);
    } else {
      setSenha('');
      setCampo('senha');
    }
  }

  return (
    <div className="admin admin--entrada">
      <form
        className="cartao"
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar();
        }}
      >
        <h1>Área restrita do totem</h1>
        <p>Entre com seu usuário e senha.</p>
        {aviso && !retorno && <MensagemRetorno retorno={{ tipo: 'erro', texto: aviso }} />}
        <Campo rotulo="Usuário">
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            maxLength={30}
            value={login}
            onFocus={() => setCampo('login')}
            onChange={(evento) => setLogin(evento.target.value)}
          />
        </Campo>
        <Campo rotulo="Senha">
          <input
            type="password"
            autoComplete="current-password"
            maxLength={72}
            value={senha}
            onFocus={() => setCampo('senha')}
            onChange={(evento) => setSenha(evento.target.value)}
          />
        </Campo>
        <TecladoVirtual
          valor={campo === 'login' ? login : senha}
          onChange={campo === 'login' ? setLogin : setSenha}
          tamanhoMaximo={campo === 'login' ? 30 : 72}
        />
        <MensagemRetorno retorno={retorno} />
        <BotaoTouch type="submit" variante="primario" disabled={!login || !senha || ocupado}>
          Entrar
        </BotaoTouch>
      </form>
    </div>
  );
}

// US 35: encerra a sessão depois de `minutos` sem toque nem tecla na tela, e avisa o
// servidor (no máximo uma vez por minuto) enquanto o usuário está mexendo, para a sessão
// não expirar no meio de um formulário longo.
function useEncerrarPorInatividade(sessao: Sessao, aoEncerrar: (motivo?: string) => void): void {
  useEffect(() => {
    const limiteMs = sessao.inatividadeMaximaMinutos * 60_000;
    let ultimaRenovacao = Date.now();

    const minutos = sessao.inatividadeMaximaMinutos;
    const expirar = () => {
      sessao.sessaoApi.sair().catch(() => undefined);
      aoEncerrar(
        `Sessão encerrada depois de ${minutos} minuto${minutos === 1 ? '' : 's'} sem uso. Entre de novo.`,
      );
    };
    let temporizador = window.setTimeout(expirar, limiteMs);

    const registrarAtividade = () => {
      window.clearTimeout(temporizador);
      temporizador = window.setTimeout(expirar, limiteMs);
      if (Date.now() - ultimaRenovacao > INTERVALO_RENOVACAO_MS) {
        ultimaRenovacao = Date.now();
        sessao.sessaoApi.renovar().catch(() => undefined);
      }
    };
    window.addEventListener('pointerdown', registrarAtividade);
    window.addEventListener('keydown', registrarAtividade);
    return () => {
      window.clearTimeout(temporizador);
      window.removeEventListener('pointerdown', registrarAtividade);
      window.removeEventListener('keydown', registrarAtividade);
    };
  }, [sessao, aoEncerrar]);
}

function Painel({ sessao, aoEncerrar }: { sessao: Sessao; aoEncerrar: (motivo?: string) => void }) {
  const [modo, setModo] = useState<Modo>(sessao.usuario.papel);
  const ehAdministrador = sessao.admin !== null;
  useEncerrarPorInatividade(sessao, aoEncerrar);

  const sair = () => {
    sessao.sessaoApi.sair().catch(() => undefined);
    aoEncerrar();
  };

  return (
    <div className="admin">
      <header className="admin__topo">
        <div>
          <h1>Área restrita do totem</h1>
          <small className="admin-usuario-logado">
            {sessao.usuario.nome} · perfil {NOME_PAPEL[sessao.usuario.papel]}
          </small>
          <br />
          <small>
            {modo === 'administrador'
              ? 'Modo Administrador: o que você salvar entra em vigor quando o servidor for reiniciado.'
              : 'Modo Funcionário: o que você mudar vale na hora.'}
          </small>
        </div>
        <div className="admin__topo-acoes">
          {/* Só o perfil Administrador alterna os modos. */}
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
          <BotaoTouch onClick={sair}>Sair</BotaoTouch>
        </div>
      </header>

      {modo === 'administrador' && sessao.admin ? (
        <PainelAdministrador api={sessao.admin} usuario={sessao.usuario} />
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

function PainelAdministrador({ api, usuario }: { api: AdminApi; usuario: UsuarioPainel }) {
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

  async function salvarConfig(
    nova: ConfigTotem,
    confirmarDesativacao?: string[],
  ): Promise<ConfigTotem> {
    const salva = await api.salvarConfig(nova, confirmarDesativacao);
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
          usuario={usuario}
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
