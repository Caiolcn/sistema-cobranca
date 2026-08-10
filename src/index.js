import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA: sem um service worker com handler de fetch o Chrome NAO considera o
// site instalavel e nunca dispara o `beforeinstallprompt` — ou seja, o convite
// de instalacao (src/components/InstalarAppPrompt.js) so apareceria no iOS.
// Fora de producao fica desligado de proposito: cache + hot reload do CRA
// juntos so geram confusao de "por que minha alteracao nao aparece".
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
