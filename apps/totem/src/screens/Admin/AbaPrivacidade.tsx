import { useCallback, useEffect, useState } from 'react';
import type {
  FinalidadeConsentimento,
  RegistroConsentimento,
  TermoConsentimento,
} from '@totem/shared';
import { BotaoTouch } from '../../components/BotaoTouch';
import { buscarTermoConsentimento } from '../../services/apiClient';
import { MensagemRetorno, useAcao, type PropsAba } from './comum';

const NOME_FINALIDADE: Record<FinalidadeConsentimento, string> = {
  cpf_nota: 'CPF na nota fiscal',
  fidelidade: 'CPF na fidelidade',
  comprovante: 'E-mail/telefone no comprovante',
};

const FINALIDADES = Object.keys(NOME_FINALIDADE) as FinalidadeConsentimento[];

// US 29: o termo de consentimento que o totem exibe e a trilha de auditoria de cada
// decisão dos clientes — data, hora, versão do termo e finalidade. Só leitura: a
// auditoria não guarda CPF, e-mail nem telefone, apenas a decisão e o pedido.
export function AbaPrivacidade({ api }: PropsAba) {
  const [termo, setTermo] = useState<TermoConsentimento | null>(null);
  const [registros, setRegistros] = useState<RegistroConsentimento[]>([]);
  const { retorno, executar } = useAcao();

  const carregar = useCallback(
    () =>
      executar(async () => {
        const [termoVigente, auditoria] = await Promise.all([
          buscarTermoConsentimento(),
          api.listarConsentimentos(),
        ]);
        setTermo(termoVigente);
        setRegistros(auditoria);
      }),
    [api, executar],
  );
  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <>
      <section className="admin-secao">
        <h2>Termo de consentimento exibido no totem</h2>
        <MensagemRetorno retorno={retorno} />
        {termo && (
          <>
            <p className="admin-dica">
              Versão {termo.versao}. O cliente vê este aviso antes de digitar qualquer dado
              pessoal e marca, uma a uma, as finalidades com que concorda.
            </p>
            <p>{termo.aviso}</p>
            <div className="admin-lista">
              {FINALIDADES.map((finalidade) => (
                <div key={finalidade} className="admin-linha admin-linha--finalidade">
                  <strong>{NOME_FINALIDADE[finalidade]}</strong>
                  <span>☐ {termo.finalidades[finalidade]}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="admin-secao">
        <h2>Auditoria do consentimento</h2>
        <p className="admin-dica">
          Uma linha por decisão, da mais recente para a mais antiga (até 200). Recusas também
          ficam registradas.
        </p>
        <div className="admin-lista admin-lista--tabela">
          <table className="admin-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Hora</th>
                <th>Finalidade</th>
                <th>Decisão</th>
                <th>Versão do termo</th>
                <th>Pedido</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((registro) => {
                const quando = new Date(registro.registradoEm);
                return (
                  <tr key={registro.id}>
                    <td>{quando.toLocaleDateString('pt-BR')}</td>
                    <td>{quando.toLocaleTimeString('pt-BR')}</td>
                    <td>{NOME_FINALIDADE[registro.finalidade]}</td>
                    <td>
                      <span
                        className={`admin-situacao admin-situacao--${registro.aceito ? 'valido' : 'inativo'}`}
                      >
                        {registro.aceito ? 'Concordou' : 'Recusou'}
                      </span>
                    </td>
                    <td>{registro.versaoTermo}</td>
                    <td title={registro.pedidoId}>{registro.pedidoId.slice(0, 8)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {registros.length === 0 && <p className="admin-dica">Nenhuma decisão registrada.</p>}
        </div>
        <BotaoTouch onClick={carregar}>Atualizar</BotaoTouch>
      </section>
    </>
  );
}
