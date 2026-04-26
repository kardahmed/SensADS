import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initGlobalErrorHandlers } from './lib/error-logger';
import './styles/globals.css';

initGlobalErrorHandlers();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
