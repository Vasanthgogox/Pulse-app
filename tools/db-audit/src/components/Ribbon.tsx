import { useAudit } from '@/context/AuditContext';

export function Ribbon() {
  const {
    refreshData,
    addNewAction,
    openSqlEdit,
    formulaActionId,
    toggleSnapPanel,
    takeLiveSnapshot,
    openConfig,
    resetVerifications,
    ribbonStatus,
    snapOpen,
  } = useAudit();

  return (
    <div className="ribbon">
      <div className="rg">
        <span className="rg-label">Home</span>
        <button className="rbtn" type="button" onClick={() => void refreshData()}>
          ⟳ Refresh
        </button>
        <button className="rbtn on" type="button">
          Freeze Panes
        </button>
      </div>
      <div className="rg">
        <span className="rg-label">Edit</span>
        <button className="rbtn" type="button" onClick={() => void addNewAction()}>
          + Add Row
        </button>
        <button className="rbtn" type="button" onClick={openSqlEdit} disabled={!formulaActionId}>
          ✎ Edit SQL
        </button>
      </div>
      <div className="rg">
        <span className="rg-label">DBA</span>
        <button className={`rbtn${snapOpen ? ' snap-on' : ''}`} type="button" onClick={toggleSnapPanel}>
          📸 Snapshot
        </button>
        <button className="rbtn" type="button" onClick={() => void takeLiveSnapshot('before')}>
          ◀ Before
        </button>
        <button className="rbtn" type="button" onClick={() => void takeLiveSnapshot('after')}>
          After ▶
        </button>
      </div>
      <div className="rg">
        <span className="rg-label">Session</span>
        <button className="rbtn" type="button" onClick={openConfig}>
          ⚙ Settings
        </button>
        <button className="rbtn" type="button" onClick={() => void resetVerifications()}>
          Reset Log
        </button>
      </div>
      <div className="rg">
        <span className="rg-label">Status</span>
        <span style={{ fontSize: 10, color: 'var(--txd)', padding: '0 4px' }}>{ribbonStatus}</span>
      </div>
    </div>
  );
}
