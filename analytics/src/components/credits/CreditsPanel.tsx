/**
 * Growth > Credits — minimal manual credit grant tool.
 *
 * Why this exists: Reach's "Earn Credits" flow (referrals, verification
 * rewards surfaced to the customer) is intentionally deferred. Until it
 * ships, a customer with 0 credits has no way to ever get any, and Boost
 * hits a dead end. This gives Customer Success / Ops a way to unblock a
 * demo or compensate a user right now, using the exact same
 * increment_credit_wallet RPC the real growth loop already uses (admin_
 * adjustment path, service-role-authorized — see
 * 20261228000000_reach_credits_admin_grant_and_payment_state.sql).
 *
 * Auditability note: pulse_credit_transactions.created_by is populated from
 * auth.uid() — which is NULL for every grant made through this console,
 * because analytics/ has no real login (service-role key only). "Granted
 * by" below is a self-reported text field folded into the ledger note as a
 * pragmatic stand-in, not a real identity — that only becomes possible once
 * Control Tower (real Supabase Auth + Platform IAM) exists.
 *
 * "Source" in Recent Activity is derived from the existing `type` column,
 * not a new stored column — SYSTEM (earn_verification/earn_referral),
 * ADMIN (admin_adjustment), USER (spend_reach/refund) map 1:1 onto types
 * that already exist, so storing a second overlapping field would just be
 * a second place for the two to drift out of sync.
 *
 * Deliberately small: this is the first child of the future Growth module
 * (Credits / Reward Rules / Reach Plans / Invitation Rules / Promotions /
 * Ledger) — no reward-rule config, no invitation config here yet.
 */
import { useMemo, useState } from 'react';
import { Search, Coins, Loader2, ChevronRight } from 'lucide-react';
import { useAdmin } from '@/context/AdminDataProvider';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface WalletState {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
}

interface LedgerRow {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
}

const PRESET_AMOUNTS = [500, 1000, 5000];

const REASON_OPTIONS = [
  'Demo',
  'Customer Compensation',
  'Verification Reward',
  'Promotional Campaign',
  'Manual Adjustment',
  'Support Resolution',
  'Other',
] as const;

const SOURCE_BY_TYPE: Record<string, { label: string; variant: 'info' | 'primary' | 'secondary' }> = {
  earn_verification: { label: 'System', variant: 'info' },
  earn_referral: { label: 'System', variant: 'info' },
  admin_adjustment: { label: 'Admin', variant: 'primary' },
  spend_reach: { label: 'User', variant: 'secondary' },
  refund: { label: 'User', variant: 'secondary' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function CreditsPanel() {
  const { applications } = useAdmin();
  const [query, setQuery] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(false);

  const [amount, setAmount] = useState<number | null>(500);
  const [customAmount, setCustomAmount] = useState('');
  const [reasonOption, setReasonOption] = useState<(typeof REASON_OPTIONS)[number]>('Demo');
  const [customReason, setCustomReason] = useState('');
  const [grantedBy, setGrantedBy] = useState('');
  const [submitting, setSubmitting] = useState<'grant' | 'deduct' | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const filteredOrgs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return applications.slice(0, 8);
    return applications.filter((o) => o.company_name.toLowerCase().includes(q)).slice(0, 8);
  }, [applications, query]);

  const selectedOrg = applications.find((o) => o.id === selectedOrgId) ?? null;

  const effectiveAmount = amount ?? (Number(customAmount) || 0);
  const effectiveReason = reasonOption === 'Other' ? customReason.trim() : reasonOption;

  async function loadWallet(orgId: string) {
    setLoadingWallet(true);
    setFeedback(null);
    const [{ data: walletRow }, { data: ledgerRows }] = await Promise.all([
      supabase.from('pulse_credit_wallets').select('balance, lifetime_earned, lifetime_spent').eq('org_id', orgId).maybeSingle(),
      supabase
        .from('pulse_credit_transactions')
        .select('id, type, amount, balance_after, notes, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);
    setWallet(walletRow ?? { balance: 0, lifetime_earned: 0, lifetime_spent: 0 });
    setLedger((ledgerRows ?? []) as LedgerRow[]);
    setLoadingWallet(false);
  }

  function selectOrg(orgId: string) {
    setSelectedOrgId(orgId);
    loadWallet(orgId);
  }

  async function submitAdjustment(direction: 'grant' | 'deduct') {
    if (!selectedOrgId) return;
    if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) {
      setFeedback({ kind: 'error', text: 'Enter a positive amount.' });
      return;
    }
    if (!effectiveReason) {
      setFeedback({ kind: 'error', text: 'Reason is required.' });
      return;
    }
    setSubmitting(direction);
    setFeedback(null);
    const signedAmount = direction === 'grant' ? effectiveAmount : -effectiveAmount;
    const notes = `${effectiveReason}${grantedBy.trim() ? ` — granted by ${grantedBy.trim()}` : ''}`;
    const { error } = await supabase.rpc('increment_credit_wallet', {
      p_org_id: selectedOrgId,
      p_type: 'admin_adjustment',
      p_amount: signedAmount,
      p_reference_type: null,
      p_reference_id: null,
      p_notes: notes,
    });
    setSubmitting(null);
    if (error) {
      setFeedback({ kind: 'error', text: error.message });
      return;
    }
    setFeedback({ kind: 'success', text: `${direction === 'grant' ? 'Granted' : 'Deducted'} ${effectiveAmount} credits.` });
    setCustomReason('');
    loadWallet(selectedOrgId);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Growth</span>
          <ChevronRight className="size-3" />
          <span className="font-semibold text-foreground">Credits</span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Manual credit grants — stand-in for Earn Credits until the growth loop ships.
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Org search */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-border p-3">
          <div className="mb-2 flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search organization…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1">
            {filteredOrgs.map((org) => (
              <button
                key={org.id}
                onClick={() => selectOrg(org.id)}
                className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                  org.id === selectedOrgId
                    ? 'border-primary/40 bg-primary/8 font-semibold text-foreground'
                    : 'border-transparent hover:bg-accent'
                }`}
              >
                <div className="truncate">{org.company_name}</div>
              </button>
            ))}
            {filteredOrgs.length === 0 ? (
              <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">No organizations match.</p>
            ) : null}
          </div>
        </aside>

        {/* Wallet + grant form */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedOrg ? (
            <p className="text-xs text-muted-foreground">Select an organization to view its wallet.</p>
          ) : loadingWallet ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="max-w-lg space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Organization</p>
                <p className="text-base font-bold text-foreground">{selectedOrg.company_name}</p>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                <Coins className="size-5 text-amber-500" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Current Balance</p>
                  <p className="text-xl font-bold text-foreground">{wallet?.balance ?? 0} Credits</p>
                </div>
                <div className="ml-auto flex gap-3 text-[10px] text-muted-foreground">
                  <span>Earned {wallet?.lifetime_earned ?? 0}</span>
                  <span>Spent {wallet?.lifetime_spent ?? 0}</span>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-3">
                <p className="text-[11px] font-semibold text-foreground">Quick Actions</p>

                <div className="flex flex-wrap gap-2">
                  {PRESET_AMOUNTS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => {
                        setAmount(preset);
                        setCustomAmount('');
                      }}
                      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        amount === preset
                          ? 'border-primary/40 bg-primary/10 text-foreground'
                          : 'border-input text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      +{preset}
                    </button>
                  ))}
                  <button
                    onClick={() => setAmount(null)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      amount === null
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-input text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {amount === null ? (
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground">Custom Amount</label>
                    <input
                      type="number"
                      min={1}
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="e.g. 750"
                      className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
                    />
                  </div>
                ) : null}

                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Reason</label>
                  <select
                    value={reasonOption}
                    onChange={(e) => setReasonOption(e.target.value as (typeof REASON_OPTIONS)[number])}
                    className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
                  >
                    {REASON_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  {reasonOption === 'Other' ? (
                    <input
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Describe the reason…"
                      className="mt-1.5 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
                    />
                  ) : null}
                </div>

                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">
                    Granted by (your name — no login yet, so this is self-reported)
                  </label>
                  <input
                    value={grantedBy}
                    onChange={(e) => setGrantedBy(e.target.value)}
                    placeholder="e.g. Vasanth"
                    className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => submitAdjustment('grant')}
                    disabled={submitting !== null}
                  >
                    Grant {effectiveAmount > 0 ? `+${effectiveAmount}` : ''} Credits
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => submitAdjustment('deduct')}
                    disabled={submitting !== null}
                  >
                    Deduct Credits
                  </Button>
                </div>
                {feedback ? (
                  <Badge variant={feedback.kind === 'success' ? 'success' : 'destructive'} appearance="light" size="sm">
                    {feedback.text}
                  </Badge>
                ) : null}
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-foreground">Recent Activity</p>
                <div className="space-y-1">
                  {ledger.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No transactions yet.</p>
                  ) : (
                    ledger.map((row) => {
                      const source = SOURCE_BY_TYPE[row.type] ?? { label: row.type, variant: 'secondary' as const };
                      return (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-[11px]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={source.variant} appearance="light" size="xs">
                                {source.label}
                              </Badge>
                              <span className="truncate font-medium text-foreground">{row.notes ?? row.type}</span>
                            </div>
                            <div className="text-muted-foreground">{timeAgo(row.created_at)}</div>
                          </div>
                          <div className={row.amount >= 0 ? 'shrink-0 font-semibold text-emerald-600' : 'shrink-0 font-semibold text-rose-600'}>
                            {row.amount >= 0 ? '+' : ''}
                            {row.amount}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
