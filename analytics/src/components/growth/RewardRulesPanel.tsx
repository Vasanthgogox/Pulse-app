/**
 * Growth > Reward Rules — CRUD over reward_rules so award amounts change
 * without a SQL migration. Service-role console, same as other Growth panels.
 */
import { useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
// Session client, not service_role: reward_rules already gates both read and
// write on the 'credits.issue' platform permission
// (reward_rules_platform_read / reward_rules_platform_write).
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface RewardRuleRow {
  id: string;
  key: string;
  credit_amount: number;
  is_active: boolean;
}

const KEY_META: Record<string, { label: string; description: string }> = {
  verification_approved: {
    label: 'Verification Approved',
    description: 'Credits granted to an organization when KYC is approved.',
  },
  referral_milestone_verified: {
    label: 'Referral Verified',
    description: 'Credits granted to the referrer when the invited org verifies.',
  },
};

export function RewardRulesPanel() {
  const [rows, setRows] = useState<RewardRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    id: string;
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('reward_rules')
      .select('id, key, credit_amount, is_active')
      .order('key');
    setRows((data ?? []) as RewardRuleRow[]);
    setDrafts({});
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveAmount(row: RewardRuleRow) {
    const raw = drafts[row.id];
    const amount = raw === undefined ? row.credit_amount : Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      setFeedback({ id: row.id, kind: 'error', text: 'Enter a non-negative number.' });
      return;
    }
    setSavingId(row.id);
    const { error } = await supabase
      .from('reward_rules')
      .update({ credit_amount: amount })
      .eq('id', row.id);
    setSavingId(null);
    if (error) {
      setFeedback({ id: row.id, kind: 'error', text: error.message });
      return;
    }
    setFeedback({ id: row.id, kind: 'success', text: 'Saved' });
    void load();
  }

  async function toggleActive(row: RewardRuleRow) {
    setSavingId(row.id);
    const { error } = await supabase
      .from('reward_rules')
      .update({ is_active: !row.is_active })
      .eq('id', row.id);
    setSavingId(null);
    if (error) {
      setFeedback({ id: row.id, kind: 'error', text: error.message });
      return;
    }
    void load();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Growth</span>
            <ChevronRight className="size-3" />
            <span className="font-semibold text-foreground">Reward Rules</span>
            <Badge variant="secondary" appearance="light" size="sm" className="ml-1">
              Config
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Configurable award amounts — read live by verification and referral settlement. No
            redeploy required.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading rules…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-xs text-center">
              <SlidersHorizontal className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-semibold text-foreground">No reward rules found</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Seeded rules should exist after the growth-loop migration.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {rows.map((row) => {
              const meta = KEY_META[row.key] ?? {
                label: row.key,
                description: 'Custom reward rule',
              };
              const draft = drafts[row.id];
              const dirty =
                draft !== undefined && Number(draft) !== row.credit_amount;
              const fb = feedback?.id === row.id ? feedback : null;

              return (
                <section
                  key={row.id}
                  className="rounded-lg border border-border bg-card"
                >
                  <header className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
                        <Badge
                          variant={row.is_active ? 'success' : 'secondary'}
                          appearance="light"
                          size="xs"
                        >
                          {row.is_active ? 'Active' : 'Off'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{meta.description}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground/80">{row.key}</p>
                    </div>
                    <button
                      onClick={() => void toggleActive(row)}
                      disabled={savingId === row.id}
                      className="shrink-0"
                      title={row.is_active ? 'Disable rule' : 'Enable rule'}
                    >
                      <span
                        className={`relative inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent transition-colors ${
                          row.is_active ? 'bg-primary' : 'bg-muted-foreground/30'
                        }`}
                      >
                        <span
                          className={`inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
                            row.is_active ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </span>
                    </button>
                  </header>

                  <div className="flex flex-wrap items-end gap-3 p-3.5">
                    <div className="min-w-[160px] flex-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Credit amount
                      </label>
                      <div className="relative mt-1">
                        <input
                          type="number"
                          min={0}
                          value={draft ?? String(row.credit_amount)}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                          }
                          className="w-full rounded-md border border-input bg-background py-2 pl-2.5 pr-10 text-sm font-semibold tabular-nums outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/25"
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase text-muted-foreground">
                          cr
                        </span>
                      </div>
                    </div>

                    <Button
                      variant={dirty ? 'primary' : 'outline'}
                      size="sm"
                      disabled={savingId === row.id || !dirty}
                      onClick={() => void saveAmount(row)}
                    >
                      {savingId === row.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : fb?.kind === 'success' ? (
                        <Check className="size-3.5" />
                      ) : null}
                      {dirty ? 'Save changes' : 'Saved'}
                    </Button>

                    {fb ? (
                      <span
                        className={`text-[11px] font-medium ${
                          fb.kind === 'success'
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {fb.text}
                      </span>
                    ) : null}
                  </div>
                </section>
              );
            })}

            <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
              Changes take effect on the next verification or referral settlement. Existing ledger
              entries are not rewritten — corrections use compensating transactions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
