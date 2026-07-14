import { Link } from 'react-router-dom';
import { useAudit } from '@/context/AuditContext';
import { ROUTES } from '@/lib/routes';

export function TitleBar() {
  const { tester, connStatus } = useAudit();
  const connLabel =
    connStatus === 'ok' ? 'CONNECTED' : connStatus === 'loading' ? 'CONNECTING…' : 'ERROR';

  return (
    <div className="titlebar">
      <div className="titlebar-brand">
        <div className="brand-mark">⚡</div>
        <div className="tbar-name">
          <em>Pulse Logistics</em> · DBA Audit System
        </div>
        <Link to={ROUTES.FLOW_MAP} className="tbar-nav-link">
          Flow Map
        </Link>
        <Link to={ROUTES.LIFECYCLE_MAP} className="tbar-nav-link">
          Lifecycle Map
        </Link>
      </div>
      <div className="titlebar-spacer" />
      <span className="tbar-tester">tester: {tester}</span>
      <div className={`conn-badge ${connStatus === 'ok' ? 'on' : 'off'}`}>
        <div className="conn-dot" />
        <span>{connLabel}</span>
      </div>
    </div>
  );
}
