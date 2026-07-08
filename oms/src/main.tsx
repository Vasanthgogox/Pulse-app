import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { configurePlatformDb } from '@pulse-platform/index';
import { getIdentityDb } from '@/lib/supabase';
import './index.css';
import App from './App';

configurePlatformDb(() => getIdentityDb());

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
