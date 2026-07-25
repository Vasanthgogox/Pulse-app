/**
 * Growth > Reward Rules — CRUD over reward_rules (award amounts without SQL).
 */
import { useEffect, useState } from 'react';
import {
  ChevronRight,
  Loader2,
  RefreshCw,
  Save,
  SlidersHorizontal,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface RewardRuleRow {
  id: string;
  key: string;
  credit_amount: number;
  is_active: boolean;
}

const KEY_LABEL: Record<string, string> = {
  verification_approved: 'Verification Approved',
  referral_milestone_verified: 'Referral Verified',
};

const KEY_HELP: Record<string, string> = {
  verification_approved: 'Credits granted to an org when KYC is approved.',
  referral_milestone_verified: 'Credits granted to the referrer when the invitee verifies.',
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
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: loadErr } = await supabase
      .from('reward_rules')
      .select('id, key, credit_amount, is_active')
      .order('key');
    if (loadErr) setError(loadErr.message);
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
    const { error: saveErr } = await supabase
      .from('reward_rules')
      .update({ credit_amount: amount })
      .eq('id', row.id);
    setSavingId(null);
    if (saveErr) {
      setFeedback({ id: row.id, kind: 'error', text: saveErr.message });
      return;
    }
    setFeedback({ id: row.id, kind: 'success', text: 'Saved.' });
    void load();
  }

  async function toggleActive(row: RewardRuleRow) {
    setSavingId(row.id);
    const { error: toggleErr } = await supabase
      .from('reward_rules')
      .update({ is_active: !row.is_active })
      .eq('id', row.id);
    setSavingId(null);
    if (toggleErr) {
      setFeedback({ id: row.id, kind: 'error', text: toggleErr.message });
      return;
    }
    setFeedback({
      id: row.id,
      kind: 'success',
      text: row.is_active ? 'Rule deactivated.' : 'Rule activated.',
    });
    void load();
  }

  const inputClass =
    'w-28 rounded-md border border-input bg-background px-2.5 py-2 text-xs tabular-nums text-foreground outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/25';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Growth</span>
            <ChevronRight className="size-3" />
            <span className="font-semibold text-foreground">Reward Rules</span>
            <Badge variant="secondary" appearance="light" size="sm" className="ml-1">
              Configurable
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Award amounts read by verification settlement — change here, no redeploy required.
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
            Loading reward rules…
          </div>
        ) : error ? (
          <div className="text-xs text-destructive">Couldn&apos;t load rules: {error}</div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-xs text-center">
              <SlidersHorizontal className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm font-semibold text-foreground">No reward rules</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Seed reward_rules in the database to configure automated credit awards.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 text-[11px] text-muted-foreground">
              Inactive rules are skipped by settlement. Amounts are Pulse Credits (1 credit ≈ ₹1 for
              incentive display).
            </div>

            {rows.map((row) => {
              const dirty =
                drafts[row.id] !== undefined && Number(drafts[row.id]) !== row.credit_amount;
              const fb = feedback?.id === row.id ? feedback : null;
              return (
                <section
                  key={row.id}
                  className="rounded-lg border border-border bg-card"
                >
                  <div className="flex flex-wrap items-start gap-3 p-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {KEY_LABEL[row.key] ?? row.key}
                        </h3>
                        <Badge
                          variant={row.is_active ? 'success' : 'secondary'}
                          appearance="light"
                          size="xs"
                        >
                          {row.is_active ? 'Active' : 'Off'}
                        </Badge>
                        {dirty ? (
                          <Badge variant="warning" appearance="light" size="xs">
                            Unsaved
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{row.key}</p>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        {KEY_HELP[row.key] ?? 'Configurable credit award rule.'}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Credits
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={drafts[row.id] ?? String(row.credit_amount)}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border px-3.5 py-2.5">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={savingId === row.id || !dirty}
                      onClick={() => void saveAmount(row)}
                    >
                      {savingId === row.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      Save amount
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={savingId === row.id}
                      onClick={() => void toggleActive(row)}
                    >
                      {row.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                    {fb ? (
                      <span
                        className={`ml-auto text-[11px] font-medium ${
                          fb.kind === 'success'
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                        }`}
                      >
                        {fb.text}
                      </span>
                    ) : (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        Current: {row.credit_amount.toLocaleString('en-IN')} cr
                      </span>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
