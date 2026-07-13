import { useAudit } from '@/context/AuditContext';

export function Toast() {
  const { toast } = useAudit();
  if (!toast) return null;
  return <div className={`toast show t-${toast.type}`}>{toast.msg}</div>;
}
