import type { SheetName } from '@/types';
import { useAudit } from '@/context/AuditContext';

const TABS: { id: SheetName; label: string }[] = [
  { id: 'flow', label: '📋 DATA FLOW MATRIX' },
  { id: 'state', label: '🔄 TRIP STATE MACHINE' },
  { id: 'coverage', label: '🛡 AUDIT COVERAGE' },
  { id: 'sql', label: '🔍 SNAPSHOT SQL' },
  { id: 'log', label: '✅ VERIFY LOG' },
];

export function SheetTabs() {
  const { sheet, setSheet } = useAudit();

  return (
    <div className="sheettabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tab${sheet === t.id ? ' active' : ''}`}
          onClick={() => setSheet(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
