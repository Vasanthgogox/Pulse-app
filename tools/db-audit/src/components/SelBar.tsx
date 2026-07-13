import { useAudit } from '@/context/AuditContext';

export function SelBar() {
  const { selected, clearSelection, deleteSelected, copySelected } = useAudit();
  const n = selected.size;
  if (!n) return null;

  return (
    <div className="sel-bar show">
      <span className="sel-bar-count">
        {n} row{n !== 1 ? 's' : ''} selected
      </span>
      <button className="sel-bar-btn copy" type="button" onClick={copySelected}>
        ⧉ Copy
      </button>
      <button className="sel-bar-btn danger" type="button" onClick={() => void deleteSelected()}>
        ✕ Delete
      </button>
      <button className="sel-bar-close" type="button" onClick={clearSelection}>
        ✕
      </button>
    </div>
  );
}
