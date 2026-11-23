import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carrega as variáveis de infra/.env (e de apps/api/.env, se existir) antes de qualquer
// outro módulo da API — por isso é o primeiro import de server.ts: alguns módulos leem o
// ambiente ao serem carregados (ex.: a escolha entre e-mail real por SMTP e simulado).
// Uma variável já definida no terminal vale mais que a do arquivo.
const pastaApi = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arquivos = [resolve(pastaApi, '.env'), resolve(pastaApi, '../../infra/.env')];

export const arquivosEnvCarregados: string[] = [];

for (const arquivo of arquivos) {
  if (existsSync(arquivo)) {
    process.loadEnvFile(arquivo);
    arquivosEnvCarregados.push(arquivo);
  }
}
