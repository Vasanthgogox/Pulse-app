import type { DetailView } from '@/types';
import { useAudit } from '@/context/AuditContext';

const VIEWS: { id: DetailView; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'table', label: 'Table' },
  { id: 'live', label: 'Live DB' },
  { id: 'compare', label: 'Compare' },
];

export function DetailDrawer() {
  const {
    detailAction,
    detailView,
    setDetailView,
    detailHtml,
    detailLoading,
    detailWide,
    closeDetail,
    copyDataDetail,
    refreshDetail,
  } = useAudit();

  const open = Boolean(detailAction);
  const showRefresh = detailView === 'live' || detailView === 'compare';

  return (
    <div
      className={`row-detail-panel${open ? ' open' : ''}${detailWide ? ' wide' : ''}`}
      aria-hidden={!open}
    >
      <div className={`row-detail-inner${detailWide ? ' wide' : ''}`}>
        <div className="row-detail-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row-detail-title">
              {detailAction ? `${detailAction.id}. ${detailAction.action}` : 'Select a row'}
            </div>
            <div className="row-detail-sub">
              {detailAction
                ? `${detailAction.route || '—'} · ${detailAction.service || '—'}`
                : 'Schema detail appears here'}
            </div>
          </div>
          <button className="row-detail-close" type="button" onClick={closeDetail} title="Close">
            ✕
          </button>
        </div>
        <div className="detail-toolbar">
          <div className="detail-view-tabs">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`detail-view-tab${detailView === v.id ? ' active' : ''}`}
                onClick={() => setDetailView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button className="row-detail-btn" type="button" onClick={copyDataDetail}>
            Copy schema
          </button>
          {showRefresh && (
            <button className="detail-refresh-btn" type="button" onClick={refreshDetail}>
              ⟳ Refresh
            </button>
          )}
        </div>
        <div className="row-detail-grid">
          {detailLoading ? (
            <p className="detail-loading">Loading…</p>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: detailHtml }} />
          )}
        </div>
      </div>
    </div>
  );
}
