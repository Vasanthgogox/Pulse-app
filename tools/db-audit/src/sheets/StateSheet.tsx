import { STATE_TRANSITIONS } from '@/lib/sqlReference';

export function StateSheet() {
  return (
    <div className="sm-sheet">
      <div className="sm-title">Trip Lifecycle — State Machine</div>
      <div className="sm-sub">
        trips.status · trigger: trg_trip_status_audit → trip_status_audit · trigger: trg_log_trip_completed →
        trip_workflow_events
      </div>
      <div className="sm-flow">
        <div className="sm-node pending">
          <div className="sm-node-status">pending</div>
          <div className="sm-node-desc">trip created</div>
        </div>
        <div className="sm-arrow">
          <div className="sm-arr-line" />
          <div className="sm-arr-label">
            assign driver
            <br />
            + vehicle
          </div>
        </div>
        <div className="sm-node assigned">
          <div className="sm-node-status">assigned</div>
          <div className="sm-node-desc">driver + vehicle set</div>
        </div>
        <div className="sm-arrow">
          <div className="sm-arr-line" />
          <div className="sm-arr-label">
            OTP verified
            <br />
            at pickup
          </div>
        </div>
        <div className="sm-node started">
          <div className="sm-node-status">started</div>
          <div className="sm-node-desc">in transit</div>
        </div>
        <div className="sm-arrow">
          <div className="sm-arr-line" />
          <div className="sm-arr-label">
            delivery done
            <br />
            + POD
          </div>
        </div>
        <div className="sm-node completed">
          <div className="sm-node-status">completed</div>
          <div className="sm-node-desc">→ trip_workflow_events</div>
        </div>
      </div>
      <div className="sm-cancel-row">
        <div className="sm-cancel-box">
          <div className="sm-cancel-title">Cancellation rules</div>
          <ul className="sm-cancel-list">
            <li>
              From <strong>pending</strong> — any dispatcher, no constraints
            </li>
            <li>
              From <strong>assigned</strong> — dispatcher only, driver notified
            </li>
            <li>
              From <strong>started</strong> — emergency only, reason required
            </li>
            <li>
              From <strong>completed</strong> — NOT ALLOWED (immutable)
            </li>
          </ul>
        </div>
        <div className="sm-cancel-box" style={{ borderColor: 'var(--upd)', background: 'var(--updb)' }}>
          <div className="sm-cancel-title" style={{ color: 'var(--upd)' }}>
            Payment status (parallel track)
          </div>
          <ul className="sm-cancel-list" style={{ ['--del' as string]: 'var(--upd)' }}>
            <li>pending → paid (full settlement)</li>
            <li>pending → partial (advance only)</li>
            <li>partial → paid (balance cleared)</li>
            <li>any → cancelled (trip cancelled)</li>
          </ul>
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--ac)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 16 }}>
        DB writes per status transition
      </div>
      <table className="sm-db-table">
        <thead>
          <tr>
            <th>Transition</th>
            <th>trips UPDATE fields</th>
            <th>Trigger fires</th>
            <th>Audit table</th>
          </tr>
        </thead>
        <tbody>
          {STATE_TRANSITIONS.map((t) => (
            <tr key={`${t.from}-${t.to}`}>
              <td>
                <span className="trans">
                  {t.from} → {t.to}
                </span>
              </td>
              <td className="cell-code">
                status, updated_at{t.to === 'completed' ? ', completed_at' : ''}
              </td>
              <td className="ta">{t.to === 'completed' ? 'trg_log_trip_completed' : 'trg_trip_status_audit'}</td>
              <td className="ta">{t.to === 'completed' ? 'trip_workflow_events' : 'trip_status_audit'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
