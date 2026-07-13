import { useAudit } from '@/context/AuditContext';

export function FormulaBar() {
  const { formulaSql, formulaActionId, copyFormula, openSqlEdit } = useAudit();
  const isHint = formulaSql.startsWith('-- Click');

  return (
    <div className="fbar">
      <div className="namebox">C1</div>
      <div className="fx-label">fx</div>
      <div className="formula-wrap" onClick={copyFormula} style={{ cursor: 'pointer' }}>
        <div className={`formula${isHint ? ' hint' : ''}`}>{formulaSql}</div>
      </div>
      <div className="fbar-actions">
        <button className="fbar-btn" type="button" onClick={copyFormula}>
          COPY
        </button>
        <button className="fbar-btn" type="button" onClick={openSqlEdit} disabled={!formulaActionId}>
          EDIT SQL
        </button>
      </div>
    </div>
  );
}
