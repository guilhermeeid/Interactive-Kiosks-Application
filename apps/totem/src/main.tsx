import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ConfigProvider } from './contexts/ConfigContext';
import { PedidoProvider } from './contexts/PedidoContext';
import { AdminScreen } from './screens/Admin';
import './styles/global.css';

// Sem roteador: o endereço /admin abre a área restrita; qualquer outro abre o fluxo do
// cliente no totem.
const ehAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin';

// No totem, o tamanho das letras acompanha a largura da tela 9:16 e o cursor vira o
// círculo de teste (ver global.css, .modo-totem).
if (!ehAdmin) {
  document.documentElement.classList.add('modo-totem');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {ehAdmin ? (
      <AdminScreen />
    ) : (
      <ConfigProvider>
        <PedidoProvider>
          <App />
        </PedidoProvider>
      </ConfigProvider>
    )}
  </React.StrictMode>,
);
