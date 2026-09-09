/**
 * Marketplace > Platform Fee Settings — CRUD over marketplace_fee_configs /
 * marketplace_fee_components. Same shape as Growth > Reward Rules
 * (RewardRulesPanel.tsx): session client, RLS is the only write gate
 * ('marketplace_fees.manage'), refetch-after-save rather than optimistic UI.
 *
 * A config is a named fee schedule: 1+ components (flat or percentage),
 * combined via comparison_mode ('highest' picks the max across components --
 * a flat component under 'highest' IS a minimum-fee floor -- 'lowest' picks
 * the min), then an optional max_fee hard cap applied on top. Only one
 * config may be is_active at a time (enforced in the DB). Disabling is
 * is_active=false, never a delete -- past configs stay visible.
 *
 * The actual fee resolution logic (calculate_marketplace_platform_fee) lives
 * in the DB and is the only place the formula is ever evaluated -- this
 * panel calls that same RPC for the live preview calculator so what an
 * admin sees here is guaranteed to match what accept_market_bid() will
 * actually charge.
 */
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
} from 'lucide-react';
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface FeeComponentRow {
  id: string;
  config_id: string;
  component_type: 'flat' | 'percentage';
  flat_amount: number | null;
  percentage_rate: number | null;
  sort_order: number;
}

interface FeeConfigRow {
  id: string;
  name: string;
  comparison_mode: 'highest' | 'lowest';
  max_fee: number | null;
  is_active: boolean;
  updated_at: string;
}

type FeeCalcResult = {
  is_active_config_found: boolean;
  resolved_fee: number;
  /** The winning bid amount — under the A8.6.2 model this IS the client/load value; it is never increased by the fee. */
  bid_amount: number;
  /** A8.3 field name kept as-is on the RPC response; no longer shown as a distinct "total" in this panel. */
  client_price: number;
  capped?: boolean;
  components?: Array<{
    component_type: string;
    flat_amount: number | null;
    percentage_rate: number | null;
    computed_amount: number;
  }>;
};

const inputClass =
  'w-full rounded-md border border-input bg-background py-2 px-2.5 text-sm font-semibold tabular-nums outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/25';

export function MarketplaceFeeSettingsPanel() {
  const [configs, setConfigs] = useState<FeeConfigRow[]>([]);
  const [componentsByConfig, setComponentsByConfig] = useState<Record<string, FeeComponentRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [previewAmount, setPreviewAmount] = useState('35000');
  const [previewResult, setPreviewResult] = useState<FeeCalcResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data: configRows, error: configErr } = await supabase
      .from('marketplace_fee_configs')
      .select('id, name, comparison_mode, max_fee, is_active, updated_at')
      .order('updated_at', { ascending: false });
    if (configErr) {
      setFeedback({ kind: 'error', text: configErr.message });
      setLoading(false);
      return;
    }
    const rows = (configRows ?? []) as FeeConfigRow[];
    setConfigs(rows);

    if (rows.length > 0) {
      const { data: compRows, error: compErr } = await supabase
        .from('marketplace_fee_components')
        .select('id, config_id, component_type, flat_amount, percentage_rate, sort_order')
        .in('config_id', rows.map((r) => r.id))
        .order('sort_order');
      if (!compErr) {
        const grouped: Record<string, FeeComponentRow[]> = {};
        for (const c of (compRows ?? []) as FeeComponentRow[]) {
          (grouped[c.config_id] ??= []).push(c);
        }
        setComponentsByConfig(grouped);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function runPreview() {
    const amount = Number(previewAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setPreviewLoading(true);
    const { data, error } = await supabase.rpc('calculate_marketplace_platform_fee', {
      p_bid_amount: amount,
    });
    setPreviewLoading(false);
    if (error) {
      setFeedback({ kind: 'error', text: error.message });
      return;
    }
    setPreviewResult(data as FeeCalcResult);
  }

  async function toggleActive(config: FeeConfigRow) {
    setSavingId(config.id);
    const { error } = await supabase
      .from('marketplace_fee_configs')
      .update({ is_active: !config.is_active })
      .eq('id', config.id);
    setSavingId(null);
    if (error) {
      setFeedback({ kind: 'error', text: error.message });
      return;
    }
    setFeedback({ kind: 'success', text: config.is_active ? 'Disabled' : 'Activated' });
    void load();
  }

  async function updateComponent(comp: FeeComponentRow, value: string) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      setFeedback({ kind: 'error', text: 'Enter a non-negative number.' });
      return;
    }
    setSavingId(comp.id);
    const patch =
      comp.component_type === 'flat' ? { flat_amount: amount } : { percentage_rate: amount };
    const { error } = await supabase
      .from('marketplace_fee_components')
      .update(patch)
      .eq('id', comp.id);
    setSavingId(null);
    if (error) {
      setFeedback({ kind: 'error', text: error.message });
      return;
    }
    void load();
  }

  async function updateMaxFee(config: FeeConfigRow, value: string) {
    const trimmed = value.trim();
    const amount = trimmed === '' ? null : Number(trimmed);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setFeedback({ kind: 'error', text: 'Max fee must be a non-negative number, or blank for no cap.' });
      return;
    }
    setSavingId(config.id);
    const { error } = await supabase
      .from('marketplace_fee_configs')
      .update({ max_fee: amount })
      .eq('id', config.id);
    setSavingId(null);
    if (error) {
      setFeedback({ kind: 'error', text: error.message });
      return;
    }
    void load();
  }

  async function updateComparisonMode(config: FeeConfigRow, mode: 'highest' | 'lowest') {
    setSavingId(config.id);
    const { error } = await supabase
      .from('marketplace_fee_configs')
      .update({ comparison_mode: mode })
      .eq('id', config.id);
    setSavingId(null);
    if (error) {
      setFeedback({ kind: 'error', text: error.message });
      return;
    }
    void load();
  }

  async function addComponent(config: FeeConfigRow, type: 'flat' | 'percentage') {
    setSavingId(config.id);
    const existing = componentsByConfig[config.id] ?? [];
    const { error } = await supabase.from('marketplace_fee_components').insert({
      config_id: config.id,
      component_type: type,
      flat_amount: type === 'flat' ? 0 : null,
      percentage_rate: type === 'percentage' ? 0 : null,
      sort_order: existing.length,
    });
    setSavingId(null);
    if (error) {
      setFeedback({ kind: 'error', text: error.message });
      return;
    }
    void load();
  }

  async function removeComponent(comp: FeeComponentRow) {
    setSavingId(comp.id);
    const { error } = await supabase.from('marketplace_fee_components').delete().eq('id', comp.id);
    setSavingId(null);
    if (error) {
      setFeedback({ kind: 'error', text: error.message });
      return;
    }
    void load();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Marketplace</span>
            <ChevronRight className="size-3" />
            <span className="font-semibold text-foreground">Platform Fee Settings</span>
            <Badge variant="secondary" appearance="light" size="sm" className="ml-1">
              Config
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Transaction commission applied to Marketplace DCO awards only. Reach and
            relationship-supplier trips are never affected by this setting.
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
            Loading configuration…
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {feedback ? (
              <div
                className={`rounded-md px-3 py-2 text-[11px] font-medium ${
                  feedback.kind === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-rose-500/10 text-rose-600'
                }`}
              >
                {feedback.text}
              </div>
            ) : null}

            {/* Live preview calculator -- calls the same RPC accept_market_bid() uses. */}
            <section className="rounded-lg border border-border bg-card p-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Calculator className="size-3.5" /> Preview calculator
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Uses the currently active config. Same function the backend calls at award time.
              </p>
              <div className="mt-2.5 flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Bid amount
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={previewAmount}
                    onChange={(e) => setPreviewAmount(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <Button size="sm" onClick={() => void runPreview()} disabled={previewLoading}>
                  {previewLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Calculate
                </Button>
              </div>
              {previewResult ? (
                !previewResult.is_active_config_found ? (
                  <p className="mt-2 text-[11px] font-medium text-amber-600">
                    No active config — platform_fee resolves to ₹0 (safe default).
                  </p>
                ) : (
                  <div className="mt-2.5 space-y-1 rounded-md bg-muted/40 p-2.5 text-[11px]">
                    {previewResult.components?.map((c, i) => (
                      <div key={i} className="flex justify-between text-muted-foreground">
                        <span>
                          {c.component_type === 'flat'
                            ? `Flat ₹${c.flat_amount}`
                            : `${c.percentage_rate}% of bid`}
                        </span>
                        <span className="tabular-nums">₹{c.computed_amount.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                    {previewResult.capped ? (
                      <div className="text-amber-600">Capped at max fee</div>
                    ) : null}
                    <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                      <span>Marketplace fee</span>
                      <span className="tabular-nums">₹{previewResult.resolved_fee.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-foreground">
                      <span>Bidder pays Pulse</span>
                      <span className="tabular-nums">₹{previewResult.resolved_fee.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Client/load value</span>
                      <span className="tabular-nums">
                        ₹{(previewResult.bid_amount ?? (Number(previewAmount) || 0)).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground">
                      <span>Bidder&apos;s effective net</span>
                      <span className="tabular-nums">
                        ₹
                        {(
                          (previewResult.bid_amount ?? (Number(previewAmount) || 0)) - previewResult.resolved_fee
                        ).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                )
              ) : null}
              <p className="mt-2 text-[10px] text-muted-foreground">
                The client pays the winning bidder the full bid amount. The winning bidder separately pays
                the Marketplace fee to Pulse before the trip and shipper contact details are unlocked.
              </p>
            </section>

            {configs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center">
                <Wallet className="size-8 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-foreground">No fee configuration yet</p>
                <p className="text-[11px] text-muted-foreground">
                  Create one via a migration (this panel only edits existing configs).
                </p>
              </div>
            ) : (
              configs.map((config) => {
                const components = componentsByConfig[config.id] ?? [];
                return (
                  <section key={config.id} className="rounded-lg border border-border bg-card">
                    <header className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{config.name}</h3>
                          <Badge
                            variant={config.is_active ? 'success' : 'secondary'}
                            appearance="light"
                            size="xs"
                          >
                            {config.is_active ? 'Active' : 'Off'}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Only one config can be active at a time — activating this one disables any other.
                        </p>
                      </div>
                      <button
                        onClick={() => void toggleActive(config)}
                        disabled={savingId === config.id}
                        className="shrink-0"
                        title={config.is_active ? 'Disable' : 'Activate'}
                      >
                        <span
                          className={`relative inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent transition-colors ${
                            config.is_active ? 'bg-primary' : 'bg-muted-foreground/30'
                          }`}
                        >
                          <span
                            className={`inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
                              config.is_active ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </span>
                      </button>
                    </header>

                    <div className="space-y-3 p-3.5">
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Comparison rule
                          </label>
                          <select
                            value={config.comparison_mode}
                            onChange={(e) =>
                              void updateComparisonMode(config, e.target.value as 'highest' | 'lowest')
                            }
                            className="mt-1 rounded-md border border-input bg-background py-2 px-2.5 text-sm font-semibold outline-none"
                          >
                            <option value="highest">Highest applicable fee</option>
                            <option value="lowest">Lowest applicable fee</option>
                          </select>
                        </div>
                        <div className="w-40">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Max fee cap (optional)
                          </label>
                          <input
                            type="number"
                            min={0}
                            defaultValue={config.max_fee ?? ''}
                            placeholder="No cap"
                            onBlur={(e) => void updateMaxFee(config, e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Components
                        </label>
                        {components.length === 0 ? (
                          <p className="flex items-center gap-1.5 text-[11px] text-amber-600">
                            <AlertTriangle className="size-3.5" /> No components — this config cannot be
                            activated until at least one is added.
                          </p>
                        ) : (
                          components.map((comp) => (
                            <div key={comp.id} className="flex items-center gap-2">
                              <Badge variant="secondary" appearance="light" size="xs" className="w-20 justify-center">
                                {comp.component_type === 'flat' ? 'Flat ₹' : 'Percent %'}
                              </Badge>
                              <input
                                type="number"
                                min={0}
                                max={comp.component_type === 'percentage' ? 100 : undefined}
                                defaultValue={
                                  comp.component_type === 'flat' ? comp.flat_amount ?? 0 : comp.percentage_rate ?? 0
                                }
                                onBlur={(e) => void updateComponent(comp, e.target.value)}
                                className={`${inputClass} max-w-[140px]`}
                              />
                              <button
                                onClick={() => void removeComponent(comp)}
                                disabled={savingId === comp.id}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"
                                title="Remove component"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={() => void addComponent(config, 'flat')}>
                            <Plus className="size-3" /> Flat component
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => void addComponent(config, 'percentage')}>
                            <Plus className="size-3" /> Percentage component
                          </Button>
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })
            )}

            <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
              Changes apply to new awards only — a trip's platform_fee is resolved and locked in at
              the moment of award (accept_market_bid). Editing a config here never changes a trip
              that was already awarded, whether or not it has completed yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
