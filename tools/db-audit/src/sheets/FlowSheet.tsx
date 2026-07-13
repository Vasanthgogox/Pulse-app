import { useAudit } from '@/context/AuditContext';
import { EditableCell } from '@/components/EditableCell';
import { badge, opCell, priB } from '@/lib/format';
import { renderDataDetailCellHtml } from '@/lib/dataDetail';

export function FlowSheet() {
  const {
    actions,
    vers,
    selRow,
    selected,
    selectRow,
    toggleRowSelect,
    selectAll,
    addNewAction,
    deleteAction,
    toggleVerify,
  } = useAudit();

  const withTrigger = actions.filter((a) => a.trigger_name).length;
  const withAudit = actions.filter((a) => a.audit_table).length;
  const vCount = Object.keys(vers).length;

  let lastGroup: string | null = null;
  const letters = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const cols = ['#', 'ACTION', 'ROUTE', 'SERVICE', 'INSERTS', 'UPDATES', 'TRIGGER', 'AUDIT TABLE', 'PRI', 'DATA WRITTEN', '✓'];

  return (
    <>
      <div className="stats-strip">
        <div className="stat-item">
          <div className="stat-val">{actions.length}</div>
          <div className="stat-label">Total actions</div>
        </div>
        <div className="stat-item">
          <div className="stat-val ins">{withTrigger}</div>
          <div className="stat-label">Auto triggers</div>
        </div>
        <div className="stat-item">
          <div className="stat-val upd">{withAudit}</div>
          <div className="stat-label">Audit covered</div>
        </div>
        <div className="stat-item">
          <div className="stat-val del">{actions.length - withAudit}</div>
          <div className="stat-label">Blind spots</div>
        </div>
        <div className="stat-item">
          <div className="stat-val trg">
            {vCount}/{actions.length}
          </div>
          <div className="stat-label">Verified</div>
        </div>
      </div>

      <table className="xtable">
        <thead>
          <tr className="cl-row">
            <th className="cb-col">
              <input
                type="checkbox"
                className="row-cb"
                title="Select all"
                onChange={(e) => selectAll(e.target.checked)}
              />
            </th>
            <th className="corner rn" />
            <th className="col-id">A</th>
            <th className="col-action">B</th>
            {letters.slice(3, 12).map((l) => (
              <th key={l}>{l}</th>
            ))}
          </tr>
          <tr className="dh-row">
            <td className="cb-col" />
            <td className="rn">1</td>
            <td className="col-id">#</td>
            <td className="col-action">ACTION</td>
            {cols.slice(2).map((c) => (
              <td key={c}>{c}</td>
            ))}
          </tr>
        </thead>
        <tbody>
          {actions.flatMap((a) => {
            const rows = [];
            if (a.flow_group && a.flow_group !== lastGroup && !a.is_subflow) {
              lastGroup = a.flow_group;
              rows.push(
                <tr key={`group-${a.flow_group}-${a.id}`} className="flow-group-row">
                  <td className="cb-col" />
                  <td className="rn" />
                  <td className="col-id" />
                  <td className="col-action">{a.flow_group}</td>
                  <td colSpan={7} />
                </tr>,
              );
            }
            const v = vers[a.id];
            const rowChecked = selected.has(a.id);
            rows.push(
              <tr
                key={a.id}
                data-id={a.id}
                className={`${selRow === a.id ? 'sel' : ''} ${rowChecked ? 'row-selected' : ''} ${a.is_subflow ? 'subflow-row' : ''}`}
                onClick={(e) => {
                  const t = e.target as HTMLElement;
                  if (t instanceof HTMLInputElement && t.type === 'checkbox') return;
                  selectRow(a.id);
                }}
              >
                <td className="cb-col">
                  <input
                    type="checkbox"
                    className="row-cb row-sel-cb"
                    checked={rowChecked}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleRowSelect(a.id, e.target.checked);
                    }}
                  />
                </td>
                <td className="rn" style={{ position: 'relative' }}>
                  {!a.is_subflow && a.seq}
                  <button
                    className="del-btn"
                    type="button"
                    title="Delete row"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteAction(a.id);
                    }}
                  >
                    ×
                  </button>
                </td>
                <td className="cell-num col-id">{a.id}</td>
                <EditableCell actionId={a.id} field="action" className="col-action">
                  {a.action}
                </EditableCell>
                <EditableCell actionId={a.id} field="route" className="cell-file">
                  {a.route || '—'}
                </EditableCell>
                <EditableCell actionId={a.id} field="service" className="cell-code">
                  {a.service || '—'}
                </EditableCell>
                <EditableCell actionId={a.id} field="ins_tables">
                  <span dangerouslySetInnerHTML={{ __html: opCell(a.ins_tables, 'b-ins') }} />
                </EditableCell>
                <EditableCell actionId={a.id} field="upd_tables">
                  <span dangerouslySetInnerHTML={{ __html: opCell(a.upd_tables, 'b-upd') }} />
                </EditableCell>
                <EditableCell actionId={a.id} field="trigger_name">
                  {a.trigger_name ? (
                    <span dangerouslySetInnerHTML={{ __html: badge(a.trigger_name, 'b-trg') }} />
                  ) : (
                    <span className="cell-dim">—</span>
                  )}
                </EditableCell>
                <EditableCell actionId={a.id} field="audit_table">
                  {a.audit_table ? (
                    <span dangerouslySetInnerHTML={{ __html: badge(a.audit_table, 'b-trg') }} />
                  ) : (
                    <span className="cell-dim">—</span>
                  )}
                </EditableCell>
                <EditableCell actionId={a.id} field="priority">
                  <span dangerouslySetInnerHTML={{ __html: priB(a.priority) }} />
                </EditableCell>
                <EditableCell actionId={a.id} field="data_detail" className="col-data-written">
                  <span dangerouslySetInnerHTML={{ __html: renderDataDetailCellHtml(a.data_detail) }} />
                </EditableCell>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="vl-chk"
                    checked={Boolean(v)}
                    onChange={(e) => {
                      e.stopPropagation();
                      void toggleVerify(a.id, e.target.checked);
                    }}
                  />
                </td>
              </tr>,
            );
            return rows;
          })}
          <tr className="add-row-tr" onClick={() => void addNewAction()}>
            <td className="cb-col" />
            <td className="rn" />
            <td colSpan={11}>＋ click to add new action row</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
