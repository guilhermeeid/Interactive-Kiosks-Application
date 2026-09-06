import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Config do Vite para o totem: roda em modo kiosk (fullscreen, sem interação de
// mouse/teclado), então o dev server fica acessível na rede local para testes em tela
// touch dedicada.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
