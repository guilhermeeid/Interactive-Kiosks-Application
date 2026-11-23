// Liga o leitor NFC (celular Android no cabo USB-C) ao totem neste notebook:
// `adb reverse` faz o localhost do celular apontar para o notebook nas portas do totem
// (5173) e da API (3333), e abre a página do leitor no Chrome do celular.
// Uso: npm run nfc:conectar  (com a depuração USB ligada no celular)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
const candidatos = [
  process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, 'platform-tools', exe),
  process.env.ANDROID_SDK_ROOT && join(process.env.ANDROID_SDK_ROOT, 'platform-tools', exe),
  process.env.LOCALAPPDATA &&
    join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exe),
  process.env.HOME && join(process.env.HOME, 'Library', 'Android', 'sdk', 'platform-tools', exe),
  process.env.HOME && join(process.env.HOME, 'Android', 'Sdk', 'platform-tools', exe),
].filter(Boolean);
const adb = candidatos.find((caminho) => existsSync(caminho)) ?? 'adb';

function rodar(...args) {
  return execFileSync(adb, args, { encoding: 'utf8' }).trim();
}

let dispositivos;
try {
  dispositivos = rodar('devices')
    .split('\n')
    .slice(1)
    .map((linha) => linha.trim().split(/\s+/))
    .filter(([id]) => id);
} catch {
  console.error('✗ adb não encontrado. Instale o Android SDK Platform-Tools.');
  process.exit(1);
}

const prontos = dispositivos.filter(([, estado]) => estado === 'device');
if (prontos.length === 0) {
  const naoAutorizado = dispositivos.some(([, estado]) => estado === 'unauthorized');
  console.error(
    naoAutorizado
      ? '✗ Celular conectado, mas sem autorização: aceite "Permitir depuração USB" na tela dele.'
      : '✗ Nenhum celular encontrado. Ligue o cabo USB-C e a "Depuração USB" nas opções do desenvolvedor.',
  );
  process.exit(1);
}

for (const porta of ['5173', '3333']) {
  rodar('reverse', `tcp:${porta}`, `tcp:${porta}`);
}
rodar(
  'shell',
  'am',
  'start',
  '-a',
  'android.intent.action.VIEW',
  '-d',
  'http://localhost:5173/leitor-nfc',
  'com.android.chrome',
);
console.log(`✓ Celular ${prontos[0][0]} ligado ao totem pelo cabo (portas 5173 e 3333).`);
console.log('✓ Página do leitor aberta no Chrome do celular: toque em "Ativar leitor".');
