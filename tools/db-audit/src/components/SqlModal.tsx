import { useAudit } from '@/context/AuditContext';

export function SqlModal() {
  const {
    sqlModalOpen,
    sqlModalLabel,
    sqlModalValue,
    sqlModalError,
    setSqlModalValue,
    closeSqlEdit,
    saveSqlEdit,
  } = useAudit();

  if (!sqlModalOpen) return null;

  return (
    <div
      className="modal-bg"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSqlEdit();
      }}
    >
      <div className="modal-box sql-modal-box">
        <div className="modal-title">Edit Verification SQL</div>
        <div className="modal-field">
          <div className="modal-label">
            Action:{' '}
            <span style={{ color: 'var(--tx)', textTransform: 'none', letterSpacing: 0 }}>
              {sqlModalLabel}
            </span>
          </div>
          <textarea
            className="modal-input"
            rows={13}
            spellCheck={false}
            value={sqlModalValue}
            onChange={(e) => setSqlModalValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void saveSqlEdit();
            }}
            placeholder="-- Enter verification SQL..."
          />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <button className="modal-btn" type="button" style={{ flex: 1 }} onClick={() => void saveSqlEdit()}>
            Save SQL
          </button>
          <button
            className="modal-btn"
            type="button"
            style={{ flex: '0 0 110px', background: 'var(--s2)', borderColor: 'var(--bd)', color: 'var(--txm)' }}
            onClick={closeSqlEdit}
          >
            Cancel
          </button>
        </div>
        <div className="modal-err">{sqlModalError}</div>
      </div>
    </div>
  );
}
