import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './css/globals.css';

// Access is gated by a real admin login (AdminAuthProvider) against
// platform_users/platform_permissions. The console no longer holds a
// service_role key of any kind.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
