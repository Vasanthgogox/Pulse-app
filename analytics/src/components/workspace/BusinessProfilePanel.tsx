import { useState } from 'react';
import { Copy, Check, User, Building2, MapPin, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useKyc } from '@/context/KycDataProvider';
import { cn } from '@/lib/utils';
import type { CheckStatus, AutomatedCheck } from '@/types/kyc';

// ─── Copy Field ───────────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="group flex items-start justify-between gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate font-mono text-[12px] text-foreground">{value || '—'}</p>
      </div>
      {value && (
        <button
          onClick={copy}
          className="mt-3.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          title="Copy"
        >
          {copied
            ? <Check className="size-3 text-green-500" />
            : <Copy className="size-3" />}
        </button>
      )}
    </div>
  );
}

// ─── Pre-check status badge ───────────────────────────────────────────────────

const CHECK_BADGE: Record<CheckStatus, { variant: 'success' | 'destructive' | 'warning' | 'secondary' | 'info'; label: string }> = {
  'Passed':        { variant: 'success',     label: 'Passed' },
  'Failed':        { variant: 'destructive', label: 'Failed' },
  'Pending':       { variant: 'secondary',   label: 'Pending' },
  'Manual Review': { variant: 'warning',     label: 'Manual' },
  'N/A':           { variant: 'info',        label: 'N/A' },
};

function CheckRow({ check }: { check: AutomatedCheck }) {
  const cfg = CHECK_BADGE[check.status];
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Badge variant={cfg.variant} appearance="light" size="sm" className="mt-0.5 shrink-0 min-w-[60px] justify-center">
        {cfg.label}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-foreground">{check.label}</p>
        {check.detail && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{check.detail}</p>
        )}
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.FC<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-1.5 mb-2">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function BusinessProfilePanel() {
  const { selectedApp } = useKyc();

  if (!selectedApp) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Select an application to review</p>
      </div>
    );
  }

  const { company_name, entity_type, gstin, pan, cin, registration_number, registration_date,
          directors, registered_address, city, state, pincode, contact_name, contact_email,
          contact_phone, trade_name, automated_checks } = selectedApp;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Company header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight text-foreground">{company_name}</h2>
            {trade_name && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">T/A {trade_name}</p>
            )}
          </div>
          <Badge variant="secondary" appearance="light" size="sm" className="shrink-0">
            {entity_type}
          </Badge>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Registration & Tax */}
        <div>
          <SectionHeader icon={Building2} title="Registration & Tax" />
          <CopyField label="GSTIN" value={gstin} />
          <CopyField label="PAN" value={pan} />
          {cin && <CopyField label="CIN" value={cin} />}
          <CopyField label="Reg. Number" value={registration_number} />
          <CopyField label="Reg. Date" value={new Date(registration_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
        </div>

        {/* Directors */}
        <div>
          <SectionHeader icon={User} title={entity_type === 'Proprietorship' ? 'Proprietor' : entity_type === 'Partnership' ? 'Partners' : 'Directors'} />
          <div className="space-y-2">
            {directors.map((d, i) => (
              <div key={i} className="rounded-md bg-muted/50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-foreground">{d.name}</p>
                  <span className="text-[10px] text-muted-foreground">{d.designation}</span>
                </div>
                {d.din !== '00000000' && d.din !== '00000001' && d.din !== '00000002' && (
                  <div className="group mt-0.5 flex items-center justify-between">
                    <p className="font-mono text-[11px] text-muted-foreground">DIN: {d.din}</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(d.din)}
                      className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 transition-opacity"
                    >
                      <Copy className="size-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Address */}
        <div>
          <SectionHeader icon={MapPin} title="Registered Address" />
          <p className="text-[12px] text-foreground leading-relaxed">{registered_address}</p>
          <p className="text-[12px] text-foreground">{city}, {state} — {pincode}</p>
        </div>

        {/* Contact */}
        <div>
          <SectionHeader icon={Phone} title="Contact" />
          <CopyField label="Name" value={contact_name} />
          <CopyField label="Email" value={contact_email} />
          <CopyField label="Phone" value={contact_phone} />
        </div>

        {/* Automated pre-checks */}
        <div>
          <SectionHeader icon={({ className }) => (
            <svg className={cn('size-3.5', className)} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm3.47 5.03-4 4a.75.75 0 0 1-1.06 0l-1.5-1.5a.75.75 0 0 1 1.06-1.06l.97.97 3.47-3.47a.75.75 0 0 1 1.06 1.06z" />
            </svg>
          )} title="Automated Pre-Checks" />
          <div className="divide-y divide-border/50">
            {automated_checks.map(c => <CheckRow key={c.id} check={c} />)}
          </div>
        </div>

        {/* Risk factors */}
        {selectedApp.risk_factors.length > 0 && (
          <div>
            <SectionHeader icon={({ className }) => (
              <svg className={cn('size-3.5', className)} viewBox="0 0 16 16" fill="currentColor">
                <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
              </svg>
            )} title="Risk Factors" />
            <ul className="space-y-1">
              {selectedApp.risk_factors.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-destructive">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-destructive" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
