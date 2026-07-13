import { useAudit } from '@/context/AuditContext';
import { badge, priB } from '@/lib/format';

export function VerifyLogSheet() {
  const { actions, vers, tester, toggleVerify, updateVerField } = useAudit();
  const vCount = Object.keys(vers).length;
  const total = actions.length;
  const pct = total ? Math.round((vCount / total) * 100) : 0;

  return (
    <div className="vl-sheet">
      <div className="vl-title">Verification Log</div>
      <div className="vl-sub">Live — syncs across all browsers via Supabase Realtime · tester: {tester}</div>
      <div className="vl-progress">
        <div>
          <div className="vl-prog-label">Verified</div>
          <div className="vl-prog-main">
            <span className="vl-prog-n">{vCount}</span>
            <span className="vl-prog-total">/ {total}</span>
          </div>
        </div>
        <div className="vl-prog-bar">
          <div className="vl-prog-fill" style={{ width: `${pct}%` }} />
        </div>
        <div>
          <div className="vl-prog-label">Coverage</div>
          <span className="vl-prog-pct">{pct}%</span>
        </div>
      </div>
      <table className="vl-table">
        <thead>
          <tr>
            <th>✓</th>
            <th>#</th>
            <th>ACTION</th>
            <th>PRI</th>
            <th>TABLES</th>
            <th>AUDIT TABLE</th>
            <th>STATUS</th>
            <th>DATE</th>
            <th>TESTER</th>
            <th>NOTES</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => {
            const v = vers[a.id];
            const done = Boolean(v);
            const date = v?.verified_at ? new Date(v.verified_at).toISOString().slice(0, 10) : '';
            return (
              <tr key={a.id} className={done ? 'vl-done' : ''} data-vl={a.id}>
                <td>
                  <input
                    type="checkbox"
                    className="vl-chk"
                    checked={done}
                    onChange={(e) => void toggleVerify(a.id, e.target.checked)}
                  />
                </td>
                <td className="cell-num">{a.id}</td>
                <td style={{ fontWeight: 'bold' }}>{a.action}</td>
                <td>
                  <span dangerouslySetInnerHTML={{ __html: priB(a.priority) }} />
                </td>
                <td className="cell-code" style={{ fontSize: 10 }}>
                  {[...(a.ins_tables || []), ...(a.upd_tables || [])].slice(0, 3).join(', ')}
                </td>
                <td>
                  {a.audit_table ? (
                    <span dangerouslySetInnerHTML={{ __html: badge(a.audit_table, 'b-trg') }} />
                  ) : (
                    <span className="cell-dim">—</span>
                  )}
                </td>
                <td>
                  {done ? (
                    <select
                      className="vl-status-select"
                      value={v?.status || 'pass'}
                      onChange={(e) => void updateVerField(a.id, 'status', e.target.value)}
                    >
                      {['pass', 'fail', 'partial'].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="cell-dim">—</span>
                  )}
                </td>
                <td className="vl-date-cell">{date}</td>
                <td>{done ? <span className="vl-tester">{v?.tester_name || '—'}</span> : <span className="cell-dim">—</span>}</td>
                <td>
                  {done ? (
                    <input
                      className="vl-note-input"
                      placeholder="add notes…"
                      defaultValue={v?.notes || ''}
                      onBlur={(e) => {
                        if (e.target.value !== (v?.notes || '')) {
                          void updateVerField(a.id, 'notes', e.target.value);
                        }
                      }}
                    />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
