import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { prepareStorage } from './lib/storage';
import './styles/app.css';

// Antes del primer render: lo guardado por versiones anteriores (o por las pruebas) no debe aparecer.
prepareStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
