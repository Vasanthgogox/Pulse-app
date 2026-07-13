import type { SnapshotData } from '@/types';
import { useAudit } from '@/context/AuditContext';

function renderSnapTable(before: SnapshotData | null, after: SnapshotData | null) {
  if (!before && !after) return null;
  const tables = Object.keys(before || after || {}).filter((k) => k !== 'snapped_at');
  return (
    <table className="snap-table" style={{ marginTop: 12 }}>
      <thead>
        <tr>
          <th>TABLE</th>
          <th>B</th>
          <th>A</th>
          <th>ΔDIFF</th>
        </tr>
      </thead>
      <tbody>
        {tables.map((t) => {
          const b = before ? (before[t] ?? '—') : '—';
          const a = after ? (after[t] ?? '—') : '—';
          const diff =
            after && before && typeof a === 'number' && typeof b === 'number' ? a - b : null;
          const diffStr =
            diff === null ? (
              <span className="diff-na">—</span>
            ) : diff > 0 ? (
              <span className="diff-pos">+{diff}</span>
            ) : diff < 0 ? (
              <span className="diff-neg">{diff}</span>
            ) : (
              <span className="diff-zero">0</span>
            );
          const highlight = diff && diff !== 0 ? 'background:rgba(227,160,7,.05);' : '';
          return (
            <tr key={t} style={{ background: highlight || undefined }}>
              <td className="snap-tbl">{t}</td>
              <td className="snap-num">{String(b)}</td>
              <td className="snap-num">{after ? String(a) : '—'}</td>
              <td>{diffStr}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SnapPanel() {
  const {
    snapOpen,
    toggleSnapPanel,
    takeLiveSnapshot,
    snapBefore,
    snapAfter,
    snapBeforeTaken,
    snapAfterTaken,
  } = useAudit();

  return (
    <div className={`snap-panel${snapOpen ? ' open' : ''}`}>
      <div className="snap-head">
        <div className="snap-title">DB Snapshot Compare</div>
        <button className="snap-close" type="button" onClick={toggleSnapPanel}>
          ✕
        </button>
      </div>
      <div className="snap-btns">
        <button
          className={`snap-btn${snapBeforeTaken ? ' taken' : ''}`}
          type="button"
          onClick={() => void takeLiveSnapshot('before')}
        >
          📸 Take Before
        </button>
        <button
          className={`snap-btn${snapAfterTaken ? ' taken' : ''}`}
          type="button"
          onClick={() => void takeLiveSnapshot('after')}
        >
          📸 Take After
        </button>
      </div>
      <div className="snap-body">
        {!snapBefore && !snapAfter ? (
          <div style={{ fontSize: 11, color: 'var(--txd)', lineHeight: 1.8, padding: '8px 0' }}>
            1. Click &quot;Take Before&quot; before your action
            <br />
            2. Perform the action in the app
            <br />
            3. Click &quot;Take After&quot;
            <br />
            4. See what changed ↓
          </div>
        ) : (
          <>
            {snapBefore && (
              <div className="snap-ts">
                BEFORE: {new Date(String(snapBefore.snapped_at)).toLocaleTimeString()}
              </div>
            )}
            {snapAfter && (
              <div className="snap-ts">
                AFTER: {new Date(String(snapAfter.snapped_at)).toLocaleTimeString()}
              </div>
            )}
            {renderSnapTable(snapBefore, snapAfter)}
          </>
        )}
      </div>
    </div>
  );
}
