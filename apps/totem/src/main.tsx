import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { PedidoProvider } from './contexts/PedidoContext';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PedidoProvider>
      <App />
    </PedidoProvider>
  </React.StrictMode>,
);
