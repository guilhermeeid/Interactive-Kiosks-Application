import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ConfigProvider } from './contexts/ConfigContext';
import { PedidoProvider } from './contexts/PedidoContext';
import { AdminScreen } from './screens/Admin';
import { LeitorNfcScreen } from './screens/LeitorNfc';
import './styles/global.css';

// Sem roteador: /admin abre a área restrita, /leitor-nfc a página do leitor NFC (no
// celular ligado por USB-C); qualquer outro endereço abre o fluxo do cliente no totem.
const caminho = window.location.pathname.replace(/\/+$/, '');
const ehAdmin = caminho === '/admin';
const ehLeitorNfc = caminho === '/leitor-nfc';

// No totem, o tamanho das letras acompanha a largura da tela 9:16 e o cursor vira o
// círculo de teste (ver global.css, .modo-totem).
if (!ehAdmin && !ehLeitorNfc) {
  document.documentElement.classList.add('modo-totem');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {ehAdmin ? (
      <AdminScreen />
    ) : ehLeitorNfc ? (
      <LeitorNfcScreen />
    ) : (
      <ConfigProvider>
        <PedidoProvider>
          <App />
        </PedidoProvider>
      </ConfigProvider>
    )}
  </React.StrictMode>,
);
