import { useState } from 'react';
import { useAudit } from '@/context/AuditContext';

export function ConfigModal() {
  const {
    configUrl,
    configKey,
    configName,
    configError,
    setConfigUrl,
    setConfigKey,
    setConfigName,
    connect,
    connStatus,
  } = useAudit();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setSubmitting(true);
    await connect(configUrl.trim(), configKey.trim(), configName.trim());
    setSubmitting(false);
  };

  return (
    <div className={`modal-bg${connStatus === 'ok' ? ' hidden' : ''}`}>
      <div className="modal-box">
        <div className="modal-title">Connect to Supabase</div>
        <div className="modal-field">
          <div className="modal-label">Project URL</div>
          <input
            className="modal-input"
            value={configUrl}
            onChange={(e) => setConfigUrl(e.target.value)}
            placeholder="https://xxxx.supabase.co"
            spellCheck={false}
          />
        </div>
        <div className="modal-field">
          <div className="modal-label">Anon Key</div>
          <input
            className="modal-input"
            type="password"
            value={configKey}
            onChange={(e) => setConfigKey(e.target.value)}
            placeholder="eyJhbGci..."
            spellCheck={false}
          />
        </div>
        <div className="modal-field">
          <div className="modal-label">Your Name (tester)</div>
          <input
            className="modal-input"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
            placeholder="e.g. nihas"
            spellCheck={false}
          />
        </div>
        <button className="modal-btn" type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Connecting...' : 'Connect'}
        </button>
        <div className="modal-err">{configError}</div>
        <div className="modal-hint">
          Loads <code>EXPO_PUBLIC_SUPABASE_URL</code> and <code>EXPO_PUBLIC_SUPABASE_ANON_KEY</code> from repo{' '}
          <code>.env</code> when present. Add <code>SUPABASE_SERVICE_ROLE_KEY</code> for Live DB tab.
        </div>
      </div>
    </div>
  );
}
