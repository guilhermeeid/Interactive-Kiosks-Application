import { useCallback, useEffect, useState } from 'react';
import type { PapelAcesso, UsuarioPainel } from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { Campo, MensagemRetorno, useAcao, type PropsAba } from './comum';

const PAPEIS: { valor: PapelAcesso; rotulo: string; dica: string }[] = [
  {
    valor: 'administrador',
    rotulo: 'Administrador',
    dica: 'Tudo: aparência, cardápio, fidelidade, pagamento, cupons, privacidade e usuários.',
  },
  {
    valor: 'funcionario',
    rotulo: 'Funcionário',
    dica: 'Caixa, balcão e produtos ao vivo (esgotado, preço, foto e descrição).',
  },
];

const NOME_PAPEL: Record<PapelAcesso, string> = {
  administrador: 'Administrador',
  funcionario: 'Funcionário',
};

interface FormUsuario {
  nome: string;
  login: string;
  papel: PapelAcesso;
  senha: string;
  confirmacao: string;
}

const FORM_VAZIO: FormUsuario = {
  nome: '',
  login: '',
  papel: 'funcionario',
  senha: '',
  confirmacao: '',
};

function exigirConfirmacao(senha: string, confirmacao: string): void {
  if (senha !== confirmacao) {
    throw new Error('A confirmação não é igual à senha');
  }
}

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Card E / US 35: usuários do painel e o perfil de cada um. Diferente do resto do modo
// Administrador, vale na hora (não espera o reinício do servidor).
export function AbaUsuarios({ api, usuario: eu }: PropsAba) {
  const [usuarios, setUsuarios] = useState<UsuarioPainel[]>([]);
  const [form, setForm] = useState<FormUsuario>(FORM_VAZIO);
  const [trocaSenha, setTrocaSenha] = useState<{
    id: string;
    senha: string;
    confirmacao: string;
  } | null>(null);
  const { retorno, ocupado, executar } = useAcao();

  const recarregar = useCallback(async () => setUsuarios(await api.listarUsuarios()), [api]);
  useEffect(() => {
    executar(recarregar);
  }, [executar, recarregar]);

  const alterar = (parcial: Partial<FormUsuario>) => setForm((atual) => ({ ...atual, ...parcial }));

  async function criar() {
    const criou = await executar(async () => {
      exigirConfirmacao(form.senha, form.confirmacao);
      await api.criarUsuario({
        nome: form.nome,
        login: form.login,
        papel: form.papel,
        senha: form.senha,
      });
      await recarregar();
    }, `Usuário "${form.login.trim().toLowerCase()}" criado. Já pode entrar.`);
    if (criou) setForm(FORM_VAZIO);
  }

  async function salvarSenha() {
    if (!trocaSenha) return;
    const salvou = await executar(async () => {
      exigirConfirmacao(trocaSenha.senha, trocaSenha.confirmacao);
      await api.redefinirSenha(trocaSenha.id, trocaSenha.senha);
      await recarregar();
    }, 'Senha trocada. Quem estava logado com a senha antiga precisa entrar de novo.');
    if (salvou) setTrocaSenha(null);
  }

  const remover = (usuario: UsuarioPainel) =>
    window.confirm(`Remover o usuário "${usuario.login}"? Ele sai do painel na hora.`) &&
    executar(async () => {
      await api.removerUsuario(usuario.id);
      await recarregar();
    }, `Usuário "${usuario.login}" removido.`);

  const desbloquear = (usuario: UsuarioPainel) =>
    executar(async () => {
      await api.desbloquearUsuario(usuario.id);
      await recarregar();
    }, `Usuário "${usuario.login}" desbloqueado.`);

  return (
    <>
      <section className="admin-secao">
        <h2>Usuários do painel</h2>
        <p className="admin-dica">
          Cada pessoa entra com o próprio usuário e senha; o perfil define o que ela pode fazer.
          Mudanças aqui valem na hora. Cinco senhas erradas seguidas bloqueiam o usuário por 15
          minutos, e a sessão termina sozinha depois de 30 minutos sem uso.
        </p>
        <MensagemRetorno retorno={retorno} />
        <div className="admin-lista">
          {usuarios.map((usuario) => (
            <div key={usuario.id} className="admin-linha">
              <div>
                <strong>
                  {usuario.nome}
                  {usuario.id === eu.id && ' (você)'}
                </strong>
                <br />
                <small>
                  {usuario.login} · {NOME_PAPEL[usuario.papel]}
                </small>
                {usuario.bloqueadoAte && (
                  <>
                    <br />
                    <small className="admin-bloqueado">
                      Bloqueado por senhas erradas até {formatarHora(usuario.bloqueadoAte)}
                    </small>
                  </>
                )}
              </div>
              <div className="admin-linha__acoes">
                {usuario.bloqueadoAte && (
                  <BotaoTouch onClick={() => desbloquear(usuario)} disabled={ocupado}>
                    Desbloquear
                  </BotaoTouch>
                )}
                <BotaoTouch
                  onClick={() => setTrocaSenha({ id: usuario.id, senha: '', confirmacao: '' })}
                  disabled={ocupado}
                >
                  Trocar senha
                </BotaoTouch>
                {/* Ninguém remove o próprio usuário (a API também recusa). */}
                {usuario.id !== eu.id && (
                  <BotaoTouch variante="perigo" onClick={() => remover(usuario)} disabled={ocupado}>
                    Remover
                  </BotaoTouch>
                )}
              </div>

              {trocaSenha?.id === usuario.id && (
                <form
                  className="admin-form admin-linha__inteira"
                  onSubmit={(evento) => {
                    evento.preventDefault();
                    salvarSenha();
                  }}
                >
                  <div className="admin-grade">
                    <Campo rotulo="Nova senha" dica="Pelo menos 8 caracteres.">
                      <input
                        type="password"
                        autoComplete="new-password"
                        maxLength={72}
                        value={trocaSenha.senha}
                        onChange={(evento) =>
                          setTrocaSenha({ ...trocaSenha, senha: evento.target.value })
                        }
                      />
                    </Campo>
                    <Campo rotulo="Repita a nova senha">
                      <input
                        type="password"
                        autoComplete="new-password"
                        maxLength={72}
                        value={trocaSenha.confirmacao}
                        onChange={(evento) =>
                          setTrocaSenha({ ...trocaSenha, confirmacao: evento.target.value })
                        }
                      />
                    </Campo>
                  </div>
                  <div className="admin-linha__acoes">
                    <BotaoTouch onClick={() => setTrocaSenha(null)}>Cancelar</BotaoTouch>
                    <BotaoTouch
                      type="submit"
                      variante="primario"
                      disabled={ocupado || !trocaSenha.senha}
                    >
                      Salvar senha
                    </BotaoTouch>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>

      <form
        className="admin-secao"
        onSubmit={(evento) => {
          evento.preventDefault();
          criar();
        }}
      >
        <h2>Novo usuário</h2>
        <div className="admin-grade">
          <Campo rotulo="Nome">
            <input
              type="text"
              maxLength={60}
              value={form.nome}
              onChange={(evento) => alterar({ nome: evento.target.value })}
            />
          </Campo>
          <Campo
            rotulo="Usuário"
            dica="De 3 a 30 caracteres: letras sem acento, números, ponto, hífen ou sublinhado."
          >
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={30}
              value={form.login}
              onChange={(evento) => alterar({ login: evento.target.value })}
            />
          </Campo>
          <Campo rotulo="Senha" dica="Pelo menos 8 caracteres.">
            <input
              type="password"
              autoComplete="new-password"
              maxLength={72}
              value={form.senha}
              onChange={(evento) => alterar({ senha: evento.target.value })}
            />
          </Campo>
          <Campo rotulo="Repita a senha">
            <input
              type="password"
              autoComplete="new-password"
              maxLength={72}
              value={form.confirmacao}
              onChange={(evento) => alterar({ confirmacao: evento.target.value })}
            />
          </Campo>
        </div>
        <fieldset className="admin-escolha">
          <legend className="admin-campo__rotulo">Perfil</legend>
          {PAPEIS.map((opcao) => (
            <label key={opcao.valor} className="admin-opcao">
              <input
                type="radio"
                name="papel-usuario"
                checked={form.papel === opcao.valor}
                onChange={() => alterar({ papel: opcao.valor })}
              />
              <span>
                <strong>{opcao.rotulo}</strong>
                <small>{opcao.dica}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <BotaoTouch
          type="submit"
          variante="primario"
          disabled={ocupado || !form.nome || !form.login || !form.senha}
        >
          Criar usuário
        </BotaoTouch>
      </form>
    </>
  );
}
