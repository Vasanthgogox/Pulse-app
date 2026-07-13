import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuditProvider } from '@/context/AuditContext';
import { AuditApp } from '@/components/AuditApp';
import { FlowMapPage } from '@/pages/FlowMapPage';
import { ROUTES } from '@/lib/routes';

export default function App() {
  return (
    <AuditProvider>
      <BrowserRouter>
        <Routes>
          <Route path={ROUTES.AUDIT} element={<AuditApp />} />
          <Route path={ROUTES.FLOW_MAP} element={<FlowMapPage />} />
          <Route path={ROUTES.VISUALIZATION} element={<Navigate to={ROUTES.FLOW_MAP} replace />} />
        </Routes>
      </BrowserRouter>
    </AuditProvider>
  );
}
