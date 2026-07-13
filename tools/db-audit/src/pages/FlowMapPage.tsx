import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlowMapExplorer } from '@/components/FlowMapExplorer';
import { FlowMapPersonaToggle } from '@/components/FlowMapPersonaToggle';
import { APP_FLOWS, type PersonaId } from '@/lib/appFlowModel';
import { ROUTES } from '@/lib/routes';

export function FlowMapPage() {
  const [personaId, setPersonaId] = useState<PersonaId>('business');
  const persona = APP_FLOWS.find((p) => p.id === personaId) ?? APP_FLOWS[0];

  const handlePersonaChange = useCallback((id: PersonaId) => {
    setPersonaId(id);
  }, []);

  return (
    <div className="app">
      <div className="titlebar">
        <div className="titlebar-brand">
          <div className="brand-mark">⚡</div>
          <div className="tbar-name">
            <em>Pulse Logistics</em> · DBA Audit System
          </div>
          <Link to={ROUTES.AUDIT} className="tbar-nav-link">
            ← Audit Matrix
          </Link>
        </div>
        <div className="titlebar-spacer" />
      </div>

      <main className="viz-page" aria-label="Pulse Flow Map">
        <div className="viz-panel viz-panel-wide">
          <header className="viz-header">
            <div className="viz-header-primary">
              <h1 className="viz-title">Pulse Flow Map</h1>
              <p className="viz-subtitle">
                Interactive map of app flows — screens, services, reads, routing branches, and DB
                provisioning. Click a <strong>variant</strong> to expand steps · click a{' '}
                <strong>step</strong> for the inspector (Detail or Table view).
              </p>
            </div>

            <div className="viz-header-l2">
              <div className="viz-header-l2-left">
                <span className="viz-header-l2-label">Persona</span>
                <FlowMapPersonaToggle value={personaId} onChange={handlePersonaChange} />
              </div>
              <div className="viz-header-l2-meta">
                <code className="viz-header-l2-route">{persona.route}</code>
                <span className="viz-header-l2-screen">{persona.screen}</span>
              </div>
            </div>
          </header>

          <FlowMapExplorer personaId={personaId} />
        </div>
      </main>
    </div>
  );
}
