import { useAudit } from '@/context/AuditContext';
import { highlightSql } from '@/lib/format';
import {
  GLOBAL_SNAPSHOT_SQL,
  ORPHAN_SQL,
  RECON_SQL,
  RLS_SQL,
} from '@/lib/sqlReference';

function SqlBlock({ name, tag, sql }: { name: string; tag: string; sql: string }) {
  const copy = () => {
    void navigator.clipboard.writeText(sql);
  };

  return (
    <div className="sql-block">
      <div className="sql-block-head" onClick={copy}>
        <div>
          <div className="sql-block-name">{name}</div>
          <div className="sql-block-tag">{tag}</div>
        </div>
        <span className="copy-hint">COPY</span>
      </div>
      <div className="sql-code" dangerouslySetInnerHTML={{ __html: highlightSql(sql) }} />
    </div>
  );
}

export function SqlSheet() {
  const { actions } = useAudit();
  const actBlocks = actions.slice(0, 8);

  return (
    <div className="sql-sheet">
      <div style={{ gridColumn: '1 / -1' }}>
        <div className="sql-title">Snapshot SQL Reference</div>
        <div className="sql-sub">Click any block header to copy SQL · Actions load from DB · Global queries hardcoded</div>
      </div>
      <SqlBlock name="Global State Snapshot" tag="before/after any action" sql={GLOBAL_SNAPSHOT_SQL} />
      <SqlBlock name="Finance Reconciliation" tag="completed trips audit" sql={RECON_SQL} />
      <SqlBlock name="RLS Enforcement Check" tag="run as anon role" sql={RLS_SQL} />
      <SqlBlock name="Orphan Audit Records" tag="data integrity check" sql={ORPHAN_SQL} />
      {actBlocks.map((a) => (
        <SqlBlock
          key={a.id}
          name={`${a.id}. ${a.action}`}
          tag={[...(a.ins_tables || []), ...(a.upd_tables || [])].join(', ')}
          sql={a.verify_sql || ''}
        />
      ))}
    </div>
  );
}
