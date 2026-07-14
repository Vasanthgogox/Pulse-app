import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './css/globals.css';

// Local/dev: no hash-token gate — access is via VITE_SUPABASE_SERVICE_ROLE_KEY in .env.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
