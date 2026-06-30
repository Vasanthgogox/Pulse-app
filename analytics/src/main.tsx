import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './css/globals.css';

const EXPECTED = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;

function getToken(): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const fromHash = hash.get('token');
  if (fromHash) {
    sessionStorage.setItem('__adm_tok', fromHash);
    history.replaceState(null, '', window.location.pathname);
    return fromHash;
  }
  return sessionStorage.getItem('__adm_tok');
}

const token = getToken();
const allowed = !EXPECTED || token === EXPECTED;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {allowed ? <App /> : null}
  </StrictMode>,
);
