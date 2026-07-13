import { useEffect } from 'react';
import { useAudit } from '@/context/AuditContext';

export function CoverageSheet() {
  const { coverage, loadCoverage } = useAudit();

  useEffect(() => {
    void loadCoverage();
  }, [loadCoverage]);

  if (!coverage.length) {
    return (
      <div style={{ padding: '40px 48px', fontSize: 11, color: 'var(--txm)' }}>
        Loading coverage from pg_catalog…
      </div>
    );
  }

  const covered = coverage.filter((r) => r.trg_count > 1).length;
  const partial = coverage.filter((r) => r.trg_count === 1).length;
  const uncovered = coverage.filter((r) => r.trg_count === 0).length;

  return (
    <div className="cov-sheet">
      <div className="cov-title">Audit Coverage — Live from pg_catalog</div>
      <div className="cov-sub">Real data from get_trigger_coverage() RPC · refresh to update</div>
      <div className="cov-summary">
        <div className="cov-stat">
          <div className="cov-stat-val v-ins">{covered}</div>
          <div className="cov-stat-label">Multi-trigger</div>
        </div>
        <div className="cov-stat">
          <div className="cov-stat-val v-ac">{partial}</div>
          <div className="cov-stat-label">Single Trigger</div>
        </div>
        <div className="cov-stat">
          <div className="cov-stat-val v-del">{uncovered}</div>
          <div className="cov-stat-label">No Triggers</div>
        </div>
        <div className="cov-stat">
          <div className="cov-stat-val v-trg">
            {coverage.filter((r) => r.has_rls).length}/{coverage.length}
          </div>
          <div className="cov-stat-label">RLS Enabled</div>
        </div>
      </div>
      <table className="cov-table">
        <thead>
          <tr>
            <th>TABLE</th>
            <th className="center">RLS</th>
            <th>TRIGGERS (live)</th>
            <th>TRIGGER COUNT</th>
            <th>COVERAGE</th>
          </tr>
        </thead>
        <tbody>
          {coverage.map((r) => {
            const pct = Math.min(100, r.trg_count * 30 + (r.has_rls ? 20 : 0));
            const cls = pct >= 70 ? 'hi' : pct >= 30 ? 'md' : 'lo';
            return (
              <tr key={r.tbl}>
                <td className="tname">{r.tbl}</td>
                <td className="center">
                  {r.has_rls ? <span className="cov-check">✔</span> : <span className="cov-x">✘</span>}
                </td>
                <td className="cov-trgs">
                  {r.trg_names?.length ? r.trg_names.join(', ') : <span className="cell-dim">—</span>}
                </td>
                <td style={{ textAlign: 'center', color: r.trg_count > 0 ? 'var(--ins)' : 'var(--del)' }}>
                  {r.trg_count}
                </td>
                <td>
                  <div className="pbar">
                    <div className="pbar-track">
                      <div className={`pbar-fill ${cls}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="pbar-txt">{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
