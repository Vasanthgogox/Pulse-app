import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditAction,
  AuditVerification,
  ConnStatus,
  CoverageRow,
  DetailView,
  LiveTableResult,
  SchemaTableResult,
  SheetName,
  SnapshotData,
  ToastType,
} from '@/types';
import {
  fetchLiveForAction,
  fetchSchemasForAction,
  renderCompareHtml,
  renderDetailTableHtml,
  renderLiveRowsTable,
} from '@/lib/auditApi';
import {
  formatDataDetailHtml,
  parseDataDetailTables,
  tablesForAction,
} from '@/lib/dataDetail';
import {
  getCfg,
  getDefaultAnonKey,
  getDefaultSupabaseUrl,
  getServiceRoleKey,
  saveCfg,
} from '@/lib/storage';

type ToastState = { msg: string; type: ToastType } | null;

interface AuditContextValue {
  connected: boolean;
  connStatus: ConnStatus;
  showConfig: boolean;
  configUrl: string;
  configKey: string;
  configName: string;
  configError: string;
  setConfigUrl: (v: string) => void;
  setConfigKey: (v: string) => void;
  setConfigName: (v: string) => void;
  openConfig: () => void;
  connect: (url: string, key: string, name: string) => Promise<void>;
  tester: string;
  actions: AuditAction[];
  vers: Record<string, AuditVerification>;
  coverage: CoverageRow[];
  sheet: SheetName;
  setSheet: (s: SheetName) => void;
  loading: boolean;
  ribbonStatus: string;
  refreshData: () => Promise<void>;
  loadCoverage: () => Promise<void>;
  selRow: string | null;
  selected: Set<string>;
  selectRow: (id: string) => void;
  clearRowSelection: () => void;
  toggleRowSelect: (id: string, checked: boolean) => void;
  selectAll: (checked: boolean) => void;
  clearSelection: () => void;
  deleteSelected: () => Promise<void>;
  copySelected: () => void;
  formulaActionId: string | null;
  formulaSql: string;
  copyFormula: () => void;
  detailAction: AuditAction | null;
  detailView: DetailView;
  setDetailView: (v: DetailView) => void;
  detailHtml: string;
  detailLoading: boolean;
  refreshDetail: () => void;
  closeDetail: () => void;
  copyDataDetail: () => void;
  detailWide: boolean;
  snapOpen: boolean;
  snapBefore: SnapshotData | null;
  snapAfter: SnapshotData | null;
  snapBeforeTaken: boolean;
  snapAfterTaken: boolean;
  toggleSnapPanel: () => void;
  takeLiveSnapshot: (type: 'before' | 'after') => Promise<void>;
  toggleVerify: (actionId: string, checked: boolean) => Promise<void>;
  updateVerField: (actionId: string, field: string, value: string) => Promise<void>;
  resetVerifications: () => Promise<void>;
  addNewAction: () => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  updateActionField: (id: string, field: keyof AuditAction, value: unknown) => Promise<void>;
  sqlModalOpen: boolean;
  sqlModalLabel: string;
  sqlModalValue: string;
  sqlModalError: string;
  openSqlEdit: () => void;
  closeSqlEdit: () => void;
  setSqlModalValue: (v: string) => void;
  saveSqlEdit: () => Promise<void>;
  toast: ToastState;
  sb: SupabaseClient | null;
  hasServiceRole: boolean;
}

const AuditContext = createContext<AuditContextValue | null>(null);

export function useAudit() {
  const ctx = useContext(AuditContext);
  if (!ctx) throw new Error('useAudit must be used within AuditProvider');
  return ctx;
}

export function AuditProvider({ children }: { children: ReactNode }) {
  const [sb, setSb] = useState<SupabaseClient | null>(null);
  const [sbAdmin, setSbAdmin] = useState<SupabaseClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>('loading');
  const [showConfig, setShowConfig] = useState(false);
  const [configUrl, setConfigUrl] = useState('');
  const [configKey, setConfigKey] = useState('');
  const [configName, setConfigName] = useState('');
  const [configError, setConfigError] = useState('');
  const [tester, setTester] = useState('');
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [vers, setVers] = useState<Record<string, AuditVerification>>({});
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [sheet, setSheetState] = useState<SheetName>('flow');
  const [loading, setLoading] = useState(false);
  const [ribbonStatus, setRibbonStatus] = useState('—');
  const [selRow, setSelRow] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formulaActionId, setFormulaActionId] = useState<string | null>(null);
  const [formulaSql, setFormulaSql] = useState('-- Click any row to load its verification SQL');
  const [detailAction, setDetailAction] = useState<AuditAction | null>(null);
  const [detailView, setDetailViewState] = useState<DetailView>('text');
  const [detailHtml, setDetailHtml] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRaw, setDetailRaw] = useState('');
  const detailLiveCache = useRef<Record<string, LiveTableResult> | null>(null);
  const detailSchemaCache = useRef<Record<string, SchemaTableResult> | null>(null);
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapBefore, setSnapBefore] = useState<SnapshotData | null>(null);
  const [snapAfter, setSnapAfter] = useState<SnapshotData | null>(null);
  const [snapBeforeTaken, setSnapBeforeTaken] = useState(false);
  const [snapAfterTaken, setSnapAfterTaken] = useState(false);
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [sqlModalLabel, setSqlModalLabel] = useState('');
  const [sqlModalValue, setSqlModalValue] = useState('');
  const [sqlModalError, setSqlModalError] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const realtimeRef = useRef<RealtimeChannel | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasServiceRole = Boolean(sbAdmin);

  const showToast = useCallback((msg: string, type: ToastType = 'info') => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const loadAllData = useCallback(async (client: SupabaseClient) => {
    setLoading(true);
    try {
      const [aRes, vRes] = await Promise.all([
        client.from('pulse_audit_actions').select('*').order('seq').order('sub_seq'),
        client.from('pulse_audit_verifications').select('*'),
      ]);
      if (aRes.error) throw aRes.error;
      const nextActions = (aRes.data as AuditAction[]) || [];
      const nextVers = Object.fromEntries(
        ((vRes.data as AuditVerification[]) || []).map((v) => [v.action_id, v]),
      );
      setActions(nextActions);
      setVers(nextVers);
      setConnStatus('ok');
      setRibbonStatus(`${nextActions.length} actions · ${Object.keys(nextVers).length} verified`);
      return true;
    } catch (e) {
      setConnStatus('err');
      const msg = e instanceof Error ? e.message : 'Load failed';
      showToast(`Load failed: ${msg}`, 'err');
      setConfigError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const subscribeRealtime = useCallback((client: SupabaseClient) => {
    if (realtimeRef.current) client.removeChannel(realtimeRef.current);
    realtimeRef.current = client
      .channel('pulse-audit-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pulse_audit_verifications' },
        ({ eventType, new: n, old: o }) => {
          setVers((prev) => {
            const next = { ...prev };
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
              next[(n as AuditVerification).action_id] = n as AuditVerification;
            } else if (eventType === 'DELETE') {
              delete next[(o as AuditVerification).action_id];
            }
            return next;
          });
        },
      )
      .subscribe();
  }, []);

  const doConnect = useCallback(
    async (url: string, key: string, name: string) => {
      const client = createClient(url, key, { auth: { persistSession: false } });
      const sk = getServiceRoleKey();
      const admin = sk
        ? createClient(url, sk, { auth: { persistSession: false, autoRefreshToken: false } })
        : null;
      setSb(client);
      setSbAdmin(admin);
      setTester(name || 'unknown');
      saveCfg({ url, key, name });
      setConnStatus('loading');
      const ok = await loadAllData(client);
      if (ok) {
        setConnected(true);
        setShowConfig(false);
        subscribeRealtime(client);
      }
    },
    [loadAllData, subscribeRealtime],
  );

  useEffect(() => {
    const url = getDefaultSupabaseUrl();
    const key = getDefaultAnonKey();
    const cfg = getCfg();
    if (url && key) {
      void doConnect(url, key, cfg.name || 'dev');
      return;
    }
    if (cfg.url && cfg.key) {
      setConfigUrl(cfg.url);
      setConfigKey(cfg.key);
      setConfigName(cfg.name || '');
      void doConnect(cfg.url, cfg.key, cfg.name || '');
      return;
    }
    setShowConfig(true);
  }, [doConnect]);

  const refreshData = useCallback(async () => {
    if (!sb) return;
    await loadAllData(sb);
  }, [sb, loadAllData]);

  const loadCoverage = useCallback(async () => {
    if (!sb || coverage.length) return;
    setLoading(true);
    const { data, error } = await sb.rpc('get_trigger_coverage');
    setLoading(false);
    if (error) {
      showToast(`Coverage load failed: ${error.message}`, 'err');
      return;
    }
    setCoverage((data as CoverageRow[]) || []);
  }, [sb, coverage.length, showToast]);

  const renderDetailBody = useCallback(
    async (action: AuditAction, view: DetailView, force = false) => {
      const parsed = parseDataDetailTables(action.data_detail || '');
      if (view === 'text') {
        setDetailHtml(formatDataDetailHtml(action.data_detail));
        setDetailLoading(false);
        return;
      }
      if (view === 'table') {
        setDetailHtml(renderDetailTableHtml(parsed));
        setDetailLoading(false);
        return;
      }
      if (view === 'compare') {
        setDetailLoading(true);
        if (!detailSchemaCache.current || force) {
          detailSchemaCache.current = await fetchSchemasForAction(sbAdmin || sb, action);
        }
        setDetailHtml(renderCompareHtml(parsed, detailSchemaCache.current));
        setDetailLoading(false);
        return;
      }
      if (!sbAdmin) {
        setDetailHtml(
          '<p class="detail-hint warn">Set <code>SUPABASE_SERVICE_ROLE_KEY</code> in project <code>.env</code> for Live DB row samples.</p>',
        );
        setDetailLoading(false);
        return;
      }
      setDetailLoading(true);
      if (!detailLiveCache.current || force) {
        detailLiveCache.current = await fetchLiveForAction(sbAdmin, action);
      }
      const refs = tablesForAction(action);
      setDetailHtml(
        refs
          .map((ref) => {
            const live = detailLiveCache.current?.[ref] || { rows: [], error: 'No data' };
            return renderLiveRowsTable(ref, live.rows, live.error);
          })
          .join('') || '<p class="detail-empty">No tables referenced for this action.</p>',
      );
      setDetailLoading(false);
    },
    [sb, sbAdmin],
  );

  const selectRow = useCallback(
    (id: string) => {
      const action = actions.find((a) => a.id === id);
      if (!action) return;
      setSelRow(id);
      setFormulaActionId(id);
      setFormulaSql(action.verify_sql || '-- No verification SQL');
      if (sheet !== 'flow') {
        setDetailAction(null);
        setDetailHtml('');
        return;
      }
      setDetailAction(action);
      setDetailRaw(action.data_detail || '');
      detailLiveCache.current = null;
      detailSchemaCache.current = null;
      void renderDetailBody(action, detailView);
    },
    [actions, sheet, detailView, renderDetailBody],
  );

  const setDetailView = useCallback(
    (view: DetailView) => {
      setDetailViewState(view);
      if (detailAction) void renderDetailBody(detailAction, view);
    },
    [detailAction, renderDetailBody],
  );

  const refreshDetail = useCallback(() => {
    if (!detailAction) return;
    detailLiveCache.current = null;
    detailSchemaCache.current = null;
    void renderDetailBody(detailAction, detailView, true);
  }, [detailAction, detailView, renderDetailBody]);

  const closeDetail = useCallback(() => {
    setDetailAction(null);
    setDetailHtml('');
    setSelRow(null);
    setFormulaActionId(null);
    setFormulaSql('-- Click any row to load its verification SQL');
  }, []);

  const copyDataDetail = useCallback(() => {
    if (!detailRaw) return;
    void navigator.clipboard.writeText(detailRaw).then(() => showToast('Schema detail copied', 'ok'));
  }, [detailRaw, showToast]);

  const copyFormula = useCallback(() => {
    if (!formulaSql || formulaSql.startsWith('-- Click')) return;
    void navigator.clipboard.writeText(formulaSql).then(() => showToast('SQL copied to clipboard', 'ok'));
  }, [formulaSql, showToast]);

  const setSheet = useCallback(
    (name: SheetName) => {
      setSheetState(name);
      closeDetail();
      if (name === 'coverage') void loadCoverage();
    },
    [closeDetail, loadCoverage],
  );

  const openConfig = useCallback(() => {
    const cfg = getCfg();
    setConfigUrl(cfg.url || getDefaultSupabaseUrl());
    setConfigKey(cfg.key || getDefaultAnonKey());
    setConfigName(cfg.name || '');
    setConfigError('');
    setShowConfig(true);
  }, []);

  const connect = useCallback(
    async (url: string, key: string, name: string) => {
      if (!url || !key) {
        setConfigError('URL and anon key are required.');
        return;
      }
      setConfigError('');
      await doConnect(url, key, name);
    },
    [doConnect],
  );

  const toggleRowSelect = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(
    (checked: boolean) => {
      setSelected(checked ? new Set(actions.map((a) => a.id)) : new Set());
    },
    [actions],
  );

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const deleteSelected = useCallback(async () => {
    if (!sb) return;
    const ids = [...selected];
    if (!ids.length) return;
    const names = ids.map((id) => actions.find((a) => a.id === id)?.action || id).join('\n• ');
    if (!confirm(`Delete ${ids.length} row${ids.length !== 1 ? 's' : ''}?\n\n• ${names}\n\nThis cannot be undone.`)) return;
    const { error } = await sb.from('pulse_audit_actions').delete().in('id', ids);
    if (error) {
      showToast(`Delete failed: ${error.message}`, 'err');
      return;
    }
    await sb.from('pulse_audit_verifications').delete().in('action_id', ids);
    setActions((prev) => prev.filter((a) => !selected.has(a.id)));
    setVers((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    if (selRow && ids.includes(selRow)) closeDetail();
    clearSelection();
    showToast(`Deleted ${ids.length} row${ids.length !== 1 ? 's' : ''}`, 'info');
  }, [sb, selected, actions, selRow, closeDetail, clearSelection, showToast]);

  const copySelected = useCallback(() => {
    const ids = [...selected];
    if (!ids.length) return;
    const rows = ids.map((id) => actions.find((a) => a.id === id)).filter(Boolean) as AuditAction[];
    const header = '#\tACTION\tROUTE\tSERVICE\tINSERTS\tUPDATES\tTRIGGER\tAUDIT TABLE\tPRI';
    const lines = rows.map((a) =>
      [a.id, a.action, a.route || '', a.service || '', (a.ins_tables || []).join(', '), (a.upd_tables || []).join(', '), a.trigger_name || '', a.audit_table || '', a.priority || ''].join('\t'),
    );
    void navigator.clipboard.writeText([header, ...lines].join('\n')).then(() =>
      showToast(`Copied ${rows.length} row${rows.length !== 1 ? 's' : ''} to clipboard`, 'ok'),
    );
  }, [selected, actions, showToast]);

  const takeLiveSnapshot = useCallback(
    async (type: 'before' | 'after') => {
      if (!sb) return;
      setLoading(true);
      const { data, error } = await sb.rpc('get_db_snapshot');
      setLoading(false);
      if (error) {
        showToast(`Snapshot failed: ${error.message}`, 'err');
        return;
      }
      if (type === 'before') {
        setSnapBefore(data as SnapshotData);
        setSnapBeforeTaken(true);
      } else {
        setSnapAfter(data as SnapshotData);
        setSnapAfterTaken(true);
      }
      setSnapOpen(true);
      showToast(`${type === 'before' ? 'Before' : 'After'} snapshot taken`, 'ok');
    },
    [sb, showToast],
  );

  const toggleVerify = useCallback(
    async (actionId: string, checked: boolean) => {
      if (!sb) return;
      if (checked) {
        const { error } = await sb.from('pulse_audit_verifications').upsert(
          {
            action_id: actionId,
            tester_name: tester,
            status: 'pass',
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'action_id' },
        );
        if (error) {
          showToast(`Verify failed: ${error.message}`, 'err');
          return;
        }
        setVers((prev) => ({ ...prev, [actionId]: { action_id: actionId, tester_name: tester, status: 'pass' } }));
        showToast(`✔ Action ${actionId} marked verified`, 'ok');
      } else {
        const { error } = await sb.from('pulse_audit_verifications').delete().eq('action_id', actionId);
        if (error) {
          showToast(`Remove failed: ${error.message}`, 'err');
          return;
        }
        setVers((prev) => {
          const next = { ...prev };
          delete next[actionId];
          return next;
        });
        showToast(`Action ${actionId} unverified`, 'info');
      }
    },
    [sb, tester, showToast],
  );

  const updateVerField = useCallback(
    async (actionId: string, field: string, value: string) => {
      if (!sb) return;
      const current = vers[actionId];
      const upsertData = {
        ...current,
        action_id: actionId,
        tester_name: tester,
        status: current?.status || 'pass',
        [field]: value,
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from('pulse_audit_verifications').upsert(upsertData, { onConflict: 'action_id' });
      if (error) {
        showToast(`Update failed: ${error.message}`, 'err');
        return;
      }
      setVers((prev) => ({ ...prev, [actionId]: { ...prev[actionId], [field]: value } }));
    },
    [sb, tester, vers, showToast],
  );

  const resetVerifications = useCallback(async () => {
    if (!sb) return;
    if (!confirm('Delete ALL verification records? This cannot be undone.')) return;
    const { error } = await sb.from('pulse_audit_verifications').delete().not('id', 'is', null);
    if (error) {
      showToast(`Reset failed: ${error.message}`, 'err');
      return;
    }
    setVers({});
    showToast('All verifications cleared', 'info');
  }, [sb, showToast]);

  const addNewAction = useCallback(async () => {
    if (!sb) return;
    const maxSeq = actions.length ? Math.max(...actions.map((a) => a.seq)) : 0;
    const newSeq = maxSeq + 1;
    const newId = String(newSeq).padStart(2, '0');
    const row: AuditAction = {
      id: newId,
      seq: newSeq,
      action: 'New Action',
      route: '',
      service: '',
      ins_tables: [],
      upd_tables: [],
      del_tables: [],
      trigger_name: null,
      audit_table: null,
      priority: 'MEDIUM',
      verify_sql: '-- Add verification SQL here',
    };
    const { error } = await sb.from('pulse_audit_actions').insert(row);
    if (error) {
      showToast(`Insert failed: ${error.message}`, 'err');
      return;
    }
    setActions((prev) => [...prev, row]);
    showToast(`Row ${newId} added — double-click any cell to edit`, 'ok');
  }, [sb, actions, showToast]);

  const deleteAction = useCallback(
    async (id: string) => {
      if (!sb) return;
      const a = actions.find((x) => x.id === id);
      if (!confirm(`Delete "${a?.action}"?\n\nThis also removes any verification record for this action.`)) return;
      const { error } = await sb.from('pulse_audit_actions').delete().eq('id', id);
      if (error) {
        showToast(`Delete failed: ${error.message}`, 'err');
        return;
      }
      setActions((prev) => prev.filter((x) => x.id !== id));
      setVers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (selRow === id) closeDetail();
      showToast('Deleted', 'info');
    },
    [sb, actions, selRow, closeDetail, showToast],
  );

  const updateActionField = useCallback(
    async (id: string, field: keyof AuditAction, value: unknown) => {
      if (!sb) return;
      const { error } = await sb.from('pulse_audit_actions').update({ [field]: value }).eq('id', id);
      if (error) {
        showToast(`Save failed: ${error.message}`, 'err');
        throw error;
      }
      setActions((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
      if (detailAction?.id === id) {
        const updated = { ...detailAction, [field]: value } as AuditAction;
        setDetailAction(updated);
        if (field === 'data_detail') {
          setDetailRaw(String(value || ''));
          void renderDetailBody(updated, detailView);
        }
      }
      showToast('Saved', 'ok');
    },
    [sb, detailAction, detailView, renderDetailBody, showToast],
  );

  const openSqlEdit = useCallback(() => {
    if (!formulaActionId) return;
    const a = actions.find((x) => x.id === formulaActionId);
    if (!a) return;
    setSqlModalLabel(`${a.id}. ${a.action}`);
    setSqlModalValue(a.verify_sql || '');
    setSqlModalError('');
    setSqlModalOpen(true);
  }, [formulaActionId, actions]);

  const saveSqlEdit = useCallback(async () => {
    if (!sb || !formulaActionId) return;
    const sql = sqlModalValue.trim();
    const { error } = await sb.from('pulse_audit_actions').update({ verify_sql: sql }).eq('id', formulaActionId);
    if (error) {
      setSqlModalError(error.message);
      return;
    }
    setActions((prev) => prev.map((a) => (a.id === formulaActionId ? { ...a, verify_sql: sql } : a)));
    setFormulaSql(sql);
    setSqlModalOpen(false);
    showToast('SQL saved', 'ok');
  }, [sb, formulaActionId, sqlModalValue, showToast]);

  const value = useMemo<AuditContextValue>(
    () => ({
      connected,
      connStatus,
      showConfig,
      configUrl,
      configKey,
      configName,
      configError,
      setConfigUrl,
      setConfigKey,
      setConfigName,
      openConfig,
      connect,
      tester,
      actions,
      vers,
      coverage,
      sheet,
      setSheet,
      loading,
      ribbonStatus,
      refreshData,
      loadCoverage,
      selRow,
      selected,
      selectRow,
      clearRowSelection: closeDetail,
      toggleRowSelect,
      selectAll,
      clearSelection,
      deleteSelected,
      copySelected,
      formulaActionId,
      formulaSql,
      copyFormula,
      detailAction,
      detailView,
      setDetailView,
      detailHtml,
      detailLoading,
      refreshDetail,
      closeDetail,
      copyDataDetail,
      detailWide: detailView !== 'text',
      snapOpen,
      snapBefore,
      snapAfter,
      snapBeforeTaken,
      snapAfterTaken,
      toggleSnapPanel: () => setSnapOpen((v) => !v),
      takeLiveSnapshot,
      toggleVerify,
      updateVerField,
      resetVerifications,
      addNewAction,
      deleteAction,
      updateActionField,
      sqlModalOpen,
      sqlModalLabel,
      sqlModalValue,
      sqlModalError,
      openSqlEdit,
      closeSqlEdit: () => setSqlModalOpen(false),
      setSqlModalValue,
      saveSqlEdit,
      toast,
      sb,
      hasServiceRole,
    }),
    [
      connected, connStatus, showConfig, configUrl, configKey, configName, configError,
      connect, tester, actions, vers, coverage, sheet, setSheet, loading, ribbonStatus,
      refreshData, loadCoverage, selRow, selected, selectRow, closeDetail, toggleRowSelect,
      selectAll, clearSelection, deleteSelected, copySelected, formulaActionId, formulaSql,
      copyFormula, detailAction, detailView, setDetailView, detailHtml, detailLoading,
      refreshDetail, copyDataDetail, snapOpen, snapBefore, snapAfter, snapBeforeTaken,
      snapAfterTaken, takeLiveSnapshot, toggleVerify, updateVerField, resetVerifications,
      addNewAction, deleteAction, updateActionField, sqlModalOpen, sqlModalLabel,
      sqlModalValue, sqlModalError, openSqlEdit, saveSqlEdit, toast, sb, hasServiceRole,
      openConfig,
    ],
  );

  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>;
}
