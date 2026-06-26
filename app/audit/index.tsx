import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

// ─── Web-only guard ───────────────────────────────────────────────────────────
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__AUDIT_WEB_ONLY__ = true;
}

const SB_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SB_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuditAction {
  id: string;
  seq: number;
  sub_seq?: number | null;
  action: string;
  route?: string;
  service?: string;
  ins_tables?: string[];
  upd_tables?: string[];
  del_tables?: string[];
  trigger_name?: string;
  audit_table?: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  verify_sql?: string;
  data_detail?: string;
  flow_group?: string;
  is_subflow?: boolean;
}

interface AuditVerification {
  action_id: string;
  tester_name?: string;
  status: 'pass' | 'fail' | 'partial';
  notes?: string;
  verified_at?: string;
}

interface SnapData {
  [key: string]: number | string;
  snapped_at: string;
}

type Sheet = 'matrix' | 'state' | 'coverage' | 'sql' | 'log';

interface CoverageRow {
  tbl: string;
  has_rls: boolean;
  trg_count: number;
  trg_names: string[];
}

// ─── Inline styles (no StyleSheet — this renders as a web page) ───────────────
const HTML_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --g:    #0a0e13;
    --s1:   #111820;
    --s2:   #162030;
    --s3:   #1a2a3a;
    --bd:   rgba(255,255,255,.08);
    --bdl:  rgba(255,255,255,.04);
    --tx:   #e8f0fa;
    --txm:  #8da0b8;
    --txd:  #4a6070;
    --ac:   #f0b429;
    --acd:  rgba(240,180,41,.13);
    --ins:  #3ecf8e;
    --insb: rgba(62,207,142,.11);
    --upd:  #5b9cf5;
    --updb: rgba(91,156,245,.11);
    --del:  #f07178;
    --delb: rgba(240,113,120,.11);
    --trg:  #c792ea;
    --trgb: rgba(199,146,234,.11);
    --mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
    --sans: system-ui, -apple-system, sans-serif;
  }

  html, body, #root, #audit-root {
    height: 100%; width: 100%;
    background: var(--g); color: var(--tx);
    font-family: var(--sans); font-size: 13px;
    line-height: 1.5; overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ── SHELL — break out of app #root max-width ── */
  .shell {
    display: flex; flex-direction: column; overflow: hidden;
    position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 9999;
  }

  /* ── TITLEBAR ── */
  .titlebar {
    height: 46px; flex-shrink: 0;
    background: var(--s1); border-bottom: 1px solid var(--bd);
    display: flex; align-items: center; gap: 10px; padding: 0 16px;
  }
  .brand { width: 26px; height: 26px; border-radius: 7px;
    background: var(--acd); border: 1px solid rgba(240,180,41,.3);
    display: flex; align-items: center; justify-content: center; font-size: 13px; }
  .brand-name { font-size: 13px; font-weight: 600; flex: 1; }
  .brand-name em { color: var(--ac); font-style: normal; }
  .conn-pill {
    font-size: 10px; font-weight: 700; letter-spacing: .05em;
    padding: 4px 10px; border-radius: 999px;
    display: flex; align-items: center; gap: 5px;
  }
  .conn-pill.on  { background: var(--insb); color: var(--ins); border: 1px solid rgba(62,207,142,.3); }
  .conn-pill.off { background: var(--delb); color: var(--del); border: 1px solid rgba(240,113,120,.3); }
  .conn-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; }
  .tester-tag { font-size: 11px; color: var(--txm); }

  /* ── RIBBON ── */
  .ribbon {
    height: 40px; flex-shrink: 0;
    background: var(--s1); border-bottom: 1px solid var(--bd);
    display: flex; align-items: center; gap: 2px; padding: 0 10px; overflow-x: auto;
  }
  .rg { display: flex; align-items: center; gap: 2px; padding: 0 8px; border-right: 1px solid var(--bd); }
  .rg:last-child { border-right: none; }
  .rg-lbl { font-size: 9px; font-weight: 700; color: var(--txd); letter-spacing: .08em;
    text-transform: uppercase; padding: 0 6px 0 2px; }
  .rbtn {
    background: transparent; border: 1px solid transparent; color: var(--txm);
    padding: 4px 9px; border-radius: 6px; cursor: pointer;
    font-family: var(--sans); font-size: 11px; font-weight: 500; transition: .12s all;
    white-space: nowrap;
  }
  .rbtn:hover { background: var(--s2); border-color: var(--bd); color: var(--tx); }
  .rbtn.active { background: var(--acd); border-color: rgba(240,180,41,.35); color: var(--ac); }
  .status-txt { font-size: 10px; color: var(--txd); padding: 0 6px; }

  /* ── STATS BAR ── */
  .stats-bar {
    display: flex; gap: 1px; flex-shrink: 0;
    background: var(--bd); border-bottom: 1px solid var(--bd);
  }
  .stat {
    flex: 1; background: var(--s1); padding: 10px 16px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .stat-val { font-size: 24px; font-weight: 700; letter-spacing: -.02em;
    line-height: 1; font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .stat-val.ac  { color: var(--ac); }
  .stat-val.ins { color: var(--ins); }
  .stat-val.upd { color: var(--upd); }
  .stat-val.del { color: var(--del); }
  .stat-val.trg { color: var(--trg); }
  .stat-lbl { font-size: 10px; color: var(--txm); letter-spacing: .03em; }

  /* ── MAIN AREA ── */
  .main { flex: 1; display: flex; overflow: hidden; }

  /* ── GRID ── */
  .grid-wrap { flex: 1; overflow: auto; position: relative; background: var(--g); }

  /* ── TABLE ── */
  .xtable { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; }

  /* column header row */
  .xtable .col-hdr th {
    background: var(--s2); border-bottom: 1px solid var(--bd); border-right: 1px solid var(--bdl);
    color: var(--txd); text-align: center; height: 26px; padding: 0 8px;
    font-size: 10px; font-weight: 700; font-family: var(--mono);
    position: sticky; top: 0; z-index: 30;
  }
  .xtable .col-hdr th.th-rn { z-index: 36; background: var(--s1); width: 44px; }
  .xtable .col-hdr th.th-id { position: sticky; left: 44px; z-index: 36; background: var(--s2); width: 52px; }
  .xtable .col-hdr th.th-action { position: sticky; left: 96px; z-index: 36; background: var(--s2); width: 200px; }

  /* data header */
  .xtable .dh td {
    background: var(--s1); border-bottom: 1px solid var(--bd); border-right: 1px solid var(--bdl);
    color: var(--txm); font-size: 10px; font-weight: 700; letter-spacing: .06em;
    text-transform: uppercase; padding: 8px 10px; height: 34px;
    position: sticky; top: 26px; z-index: 25; white-space: nowrap;
  }
  .xtable .dh td.td-rn { position: sticky; left: 0; z-index: 31; background: var(--s1); }
  .xtable .dh td.td-id { position: sticky; left: 44px; z-index: 31; background: var(--s1); }
  .xtable .dh td.td-action { position: sticky; left: 96px; z-index: 31; background: var(--s1); }

  /* rn (row number) col */
  .xtable td.rn, .xtable th.rn {
    background: var(--s1); border-right: 1px solid var(--bd); border-bottom: 1px solid var(--bdl);
    color: var(--txd); text-align: right; width: 44px; padding: 0 8px;
    font-size: 10px; font-family: var(--mono);
    position: sticky; left: 0; z-index: 20;
  }
  /* id col */
  .xtable td.col-id, .xtable th.col-id {
    position: sticky; left: 44px; z-index: 21;
    background: var(--s1); width: 52px; min-width: 52px;
    text-align: center; border-right: 1px solid var(--bdl); border-bottom: 1px solid var(--bdl);
    font-family: var(--mono); font-size: 11px; font-weight: 600; color: var(--ac);
  }
  /* action col */
  .xtable td.col-action, .xtable th.col-action {
    position: sticky; left: 96px; z-index: 21;
    background: var(--s1); width: 210px; min-width: 210px;
    border-right: 2px solid rgba(255,255,255,.1);
    box-shadow: 4px 0 12px rgba(0,0,0,.4);
    white-space: nowrap; font-size: 13px; font-weight: 500;
    padding: 0 12px; border-bottom: 1px solid var(--bdl);
  }

  /* body rows */
  .xtable tbody tr { cursor: pointer; transition: background .08s; }
  .xtable tbody tr:hover td { background: rgba(255,255,255,.025); }
  .xtable tbody tr.sel td { background: rgba(240,180,41,.07) !important; }
  .xtable tbody tr.sel td.col-id { color: var(--ac); }
  .xtable tbody tr.sel td.col-action { background: rgba(240,180,41,.1) !important; }
  .xtable tbody tr.sel td.rn { color: var(--ac); }

  .xtable tbody td {
    border-bottom: 1px solid var(--bdl); border-right: 1px solid var(--bdl);
    padding: 9px 10px; font-size: 12px; color: var(--tx);
    white-space: nowrap; vertical-align: middle; min-height: 40px;
  }

  /* group row */
  .xtable tr.grp td {
    background: var(--s2) !important; border-top: 2px solid rgba(240,180,41,.2);
    border-bottom: 1px solid var(--bd); padding: 6px 10px;
    font-size: 9px; font-weight: 700; letter-spacing: .1em;
    text-transform: uppercase; color: var(--ac);
  }
  .xtable tr.grp td.rn,
  .xtable tr.grp td.col-id,
  .xtable tr.grp td.col-action { background: var(--s2) !important; }

  /* subflow rows */
  .xtable tr.sub td.col-action {
    padding-left: 24px; color: var(--txm); font-style: italic;
  }
  .xtable tr.sub td.col-action::before { content: '┗ '; color: var(--ac); font-style: normal; }

  /* badges */
  .badge {
    display: inline-flex; align-items: center;
    padding: 2px 7px; font-size: 10px; font-weight: 700;
    letter-spacing: .03em; border-radius: 5px; white-space: nowrap; vertical-align: middle;
    font-family: var(--mono);
  }
  .b-ins { background: var(--insb); color: var(--ins); border: 1px solid rgba(62,207,142,.25); }
  .b-upd { background: var(--updb); color: var(--upd); border: 1px solid rgba(91,156,245,.25); }
  .b-del { background: var(--delb); color: var(--del); border: 1px solid rgba(240,113,120,.25); }
  .b-trg { background: var(--trgb); color: var(--trg); border: 1px solid rgba(199,146,234,.25); }
  .b-hi  { background: var(--delb); color: var(--del); border: 1px solid rgba(240,113,120,.25); }
  .b-md  { background: var(--acd);  color: var(--ac);  border: 1px solid rgba(240,180,41,.25); }
  .b-lo  { background: rgba(20,30,40,.8); color: var(--txm); border: 1px solid var(--bd); }
  .b-pass { background: var(--insb); color: var(--ins); border: 1px solid rgba(62,207,142,.25); }
  .b-fail { background: var(--delb); color: var(--del); border: 1px solid rgba(240,113,120,.25); }
  .b-partial { background: var(--acd); color: var(--ac); border: 1px solid rgba(240,180,41,.25); }

  .cell-file { color: #c792ea; font-family: var(--mono); font-size: 11px; }
  .cell-code { color: #9cdcfe; font-family: var(--mono); font-size: 11px; }
  .cell-dim  { color: var(--txd); }

  /* verify check */
  .vchk { width: 13px; height: 13px; accent-color: var(--ins); cursor: pointer; }

  /* ── DETAIL PANEL ── */
  .detail-panel {
    width: 0; overflow: hidden; flex-shrink: 0;
    background: var(--s1); border-left: 1px solid var(--bd);
    transition: width .22s cubic-bezier(.4,0,.2,1);
    display: flex; flex-direction: column;
  }
  .detail-panel.open { width: 460px; }

  .dp-head {
    padding: 14px 18px 12px; border-bottom: 1px solid var(--bd); flex-shrink: 0;
    display: flex; align-items: flex-start; gap: 10px;
  }
  .dp-id-badge {
    width: 36px; height: 36px; border-radius: 9px;
    background: var(--acd); border: 1px solid rgba(240,180,41,.3);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--ac);
    flex-shrink: 0;
  }
  .dp-title-wrap { flex: 1; min-width: 0; }
  .dp-title { font-size: 15px; font-weight: 700; color: var(--tx); line-height: 1.3; }
  .dp-sub { font-size: 11px; color: var(--txm); margin-top: 2px; font-family: var(--mono); }
  .dp-close {
    background: none; border: 1px solid var(--bd); color: var(--txm);
    width: 28px; height: 28px; border-radius: 6px; cursor: pointer;
    font-size: 14px; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: .12s;
  }
  .dp-close:hover { border-color: rgba(240,180,41,.4); color: var(--ac); }

  .dp-body { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 16px; }

  /* status row in detail */
  .dp-status-row { display: flex; gap: 8px; flex-wrap: wrap; }

  /* section block */
  .dp-section { display: flex; flex-direction: column; gap: 8px; }
  .dp-section-label {
    font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
    color: var(--txd); border-bottom: 1px solid var(--bd); padding-bottom: 6px;
  }

  /* data flow card */
  .flow-card {
    background: var(--s2); border: 1px solid var(--bd); border-radius: 9px;
    overflow: hidden;
  }
  .flow-card-head {
    padding: 8px 12px; background: rgba(255,255,255,.03);
    border-bottom: 1px solid var(--bd);
    display: flex; align-items: center; justify-content: space-between;
  }
  .flow-card-name { font-size: 11px; font-weight: 700; color: var(--trg); font-family: var(--mono); }
  .flow-card-op { font-size: 9px; font-weight: 700; letter-spacing: .06em; }
  .flow-card-fields { padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; }
  .flow-field { display: flex; align-items: baseline; gap: 8px; font-family: var(--mono); font-size: 11px; }
  .flow-field-name { color: #9cdcfe; min-width: 140px; }
  .flow-field-val { color: var(--txm); font-size: 10px; }

  /* route path */
  .route-path {
    background: var(--s2); border: 1px solid var(--bd); border-radius: 7px;
    padding: 8px 12px; font-family: var(--mono); font-size: 11px; color: #c792ea;
    word-break: break-all; line-height: 1.6;
  }

  /* SQL block */
  .sql-block {
    background: var(--g); border: 1px solid var(--bd); border-radius: 7px; overflow: hidden;
  }
  .sql-block-head {
    background: var(--s2); padding: 7px 12px;
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid var(--bd);
  }
  .sql-block-title { font-size: 10px; font-weight: 700; color: var(--ac); letter-spacing: .06em; }
  .sql-copy-btn {
    background: none; border: none; color: var(--txm); cursor: pointer;
    font-size: 10px; font-weight: 600; font-family: var(--sans);
    padding: 2px 6px; border-radius: 4px; transition: .12s;
  }
  .sql-copy-btn:hover { color: var(--ins); }
  .sql-code {
    padding: 12px; font-family: var(--mono); font-size: 11px;
    line-height: 1.8; overflow-x: auto; white-space: pre;
    color: #b8f0d8;
  }
  .sk  { color: #FF7B72; }
  .ss  { color: #A5D6FF; }
  .sc  { color: #CDB4DB; }
  .scm { color: var(--txd); font-style: italic; }

  /* verify form */
  .verify-form { display: flex; flex-direction: column; gap: 8px; }
  .verify-row { display: flex; gap: 8px; align-items: center; }
  .verify-label { font-size: 11px; color: var(--txm); min-width: 60px; }
  .ver-select, .ver-input {
    background: var(--s2); border: 1px solid var(--bd); color: var(--tx);
    border-radius: 6px; padding: 5px 8px; font-family: var(--sans); font-size: 12px;
    outline: none; transition: .12s;
  }
  .ver-select:focus, .ver-input:focus { border-color: var(--ac); }
  .ver-input { flex: 1; }
  .ver-save-btn {
    background: linear-gradient(180deg, #f5c542 0%, #e8a820 100%);
    border: none; color: #1a1200; padding: 8px 16px;
    border-radius: 7px; font-weight: 700; font-size: 12px;
    cursor: pointer; transition: .12s; align-self: flex-start;
  }
  .ver-save-btn:hover { opacity: .9; transform: translateY(-1px); }

  /* snapshot compare */
  .snap-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .snap-box {
    background: var(--s2); border: 1px solid var(--bd); border-radius: 7px; padding: 10px 12px;
  }
  .snap-box-title { font-size: 9px; font-weight: 700; color: var(--txd);
    letter-spacing: .08em; text-transform: uppercase; margin-bottom: 6px; }
  .snap-val { font-size: 22px; font-weight: 700; font-family: var(--mono);
    font-variant-numeric: tabular-nums; color: var(--ac); }
  .snap-diff { font-size: 11px; font-family: var(--mono); font-weight: 700; margin-top: 2px; }
  .snap-diff.pos { color: var(--ins); }
  .snap-diff.neg { color: var(--del); }
  .snap-diff.zero { color: var(--txd); }

  /* ── TABS ── */
  .tabs {
    height: 38px; flex-shrink: 0;
    background: var(--s1); border-top: 1px solid var(--bd);
    display: flex; align-items: stretch; padding: 0 8px; gap: 2px;
    overflow-x: auto;
  }
  .tab {
    background: transparent; border: none; border-bottom: 2px solid transparent;
    color: var(--txm); padding: 0 13px; cursor: pointer;
    font-family: var(--sans); font-size: 11px; font-weight: 600; transition: .12s;
    white-space: nowrap; display: flex; align-items: center; gap: 5px;
  }
  .tab:hover { color: var(--tx); }
  .tab.active { color: var(--tx); border-bottom-color: var(--ac); }

  /* ── STATE MACHINE SHEET ── */
  .sm-sheet { padding: 40px 48px; }
  .sm-title { font-size: 11px; letter-spacing: .12em; color: var(--ac); text-transform: uppercase; margin-bottom: 2px; }
  .sm-sub { font-size: 10px; color: var(--txm); margin-bottom: 40px; }
  .sm-flow { display: flex; align-items: center; flex-wrap: wrap; gap: 0; margin-bottom: 40px; }
  .sm-node { border: 2px solid var(--bd); padding: 14px 18px; min-width: 130px;
    text-align: center; flex-shrink: 0; border-radius: 2px; }
  .sm-node.pending   { border-color: #545d68; background: rgba(84,93,104,.12); }
  .sm-node.assigned  { border-color: var(--upd); background: var(--updb); }
  .sm-node.started   { border-color: var(--ac);  background: var(--acd); }
  .sm-node.in-transit{ border-color: #f5a623; background: rgba(245,166,35,.1); }
  .sm-node.completed { border-color: var(--ins); background: var(--insb); }
  .sm-node.cancelled { border-color: var(--del); background: var(--delb); }
  .sm-status { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .sm-node.pending   .sm-status { color: #cdd9e5; }
  .sm-node.assigned  .sm-status { color: var(--upd); }
  .sm-node.started   .sm-status { color: var(--ac); }
  .sm-node.in-transit .sm-status { color: #f5a623; }
  .sm-node.completed .sm-status { color: var(--ins); }
  .sm-node.cancelled .sm-status { color: var(--del); }
  .sm-node-desc { font-size: 9px; color: var(--txm); margin-top: 3px; }
  .sm-arrow { display: flex; flex-direction: column; align-items: center;
    gap: 2px; padding: 0 4px; flex-shrink: 0; }
  .sm-arr-line { width: 42px; height: 2px; background: var(--bd); position: relative; }
  .sm-arr-line::after { content: '▶'; position: absolute; right: -7px; top: -7px;
    color: var(--bd); font-size: 13px; }
  .sm-arr-label { font-size: 9px; color: var(--txd); white-space: nowrap; text-align: center; }

  /* ── COVERAGE SHEET ── */
  .cov-sheet { padding: 40px 48px; }
  .pbar-track { width: 80px; height: 6px; background: var(--s3); border-radius: 3px; display: inline-block; vertical-align: middle; overflow: hidden; }
  .pbar-fill { height: 100%; border-radius: 3px; }
  .pbar-fill.hi { background: var(--ins); }
  .pbar-fill.md { background: var(--ac); }
  .pbar-fill.lo { background: var(--del); }

  /* ── SQL SHEET ── */
  .sql-sheet { padding: 40px 48px; }
  .sql-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  /* ── LOG SHEET ── */
  .log-sheet { padding: 32px 40px; }
  .log-progress {
    background: var(--s1); border: 1px solid var(--bd);
    border-left: 3px solid var(--ac);
    padding: 14px 20px; margin-bottom: 28px;
    display: flex; align-items: center; gap: 28px; flex-wrap: wrap;
  }
  .log-prog-n { font-size: 32px; font-family: var(--mono); color: var(--ac); letter-spacing: -.02em; }
  .log-prog-bar { flex: 1; min-width: 140px; height: 4px; background: var(--s3); }
  .log-prog-fill { height: 100%; background: var(--ac); transition: .4s width; }

  /* ── DATA TABLE (shared) ── */
  .dtable { border-collapse: collapse; width: 100%; }
  .dtable th {
    background: var(--s2); border: 1px solid var(--bd);
    padding: 6px 12px; font-size: 9px; font-weight: 700; color: var(--ac);
    letter-spacing: .1em; text-transform: uppercase; text-align: left; white-space: nowrap;
  }
  .dtable td {
    border: 1px solid var(--bdl); padding: 6px 12px;
    font-size: 11px; vertical-align: middle;
  }
  .dtable tr:hover td { background: rgba(240,180,41,.03); }

  /* ── TOAST ── */
  .toast {
    position: fixed; bottom: 20px; right: 20px; z-index: 9999;
    background: var(--s2); border: 1px solid var(--bd);
    border-radius: 8px; padding: 10px 14px;
    font-size: 12px; font-weight: 500;
    opacity: 0; transition: opacity .2s; pointer-events: none;
    box-shadow: 0 8px 24px rgba(0,0,0,.5);
  }
  .toast.show { opacity: 1; }
  .toast.ok   { border-color: var(--ins); color: var(--ins); }
  .toast.err  { border-color: var(--del); color: var(--del); }
  .toast.info { border-color: var(--upd); color: var(--upd); }

  /* ── LOADING BAR ── */
  .lbar { height: 2px; background: var(--ac); width: 0; transition: width .3s;
    position: sticky; top: 0; z-index: 50; }
  .lbar.active { animation: lbaranim 1.4s ease-in-out infinite; }
  @keyframes lbaranim { 0%{width:0;opacity:1} 70%{width:85%} 100%{width:100%;opacity:0} }

  /* scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--g); }
  ::-webkit-scrollbar-thumb { background: var(--s3); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--txd); }

  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
`;

// ─── Parse data_detail (handles both plain text and JSON) ─────────────────────
interface ParsedWrite { table: string; op: 'INSERT' | 'UPDATE' | 'DELETE'; fields: { name: string; value: string }[] }

function parseDataDetail(raw: string): ParsedWrite[] {
  if (!raw) return [];

  // Try JSON
  try {
    const obj = JSON.parse(raw);
    if (obj.writes) {
      return Object.entries(obj.writes as Record<string, Record<string, string>>).map(([table, fields]) => ({
        table,
        op: (fields.op as 'INSERT' | 'UPDATE' | 'DELETE') ?? 'INSERT',
        fields: Object.entries(fields)
          .filter(([k]) => k !== 'op' && k !== 'note')
          .map(([k, v]) => ({ name: k, value: String(v) })),
      }));
    }
  } catch (_) { /* plain text */ }

  // Plain text: split on lines, group by "table:" header
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const result: ParsedWrite[] = [];
  let current: ParsedWrite | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^([\w_]+)\s*:\s*(.*)/);
    if (headerMatch && !line.startsWith('+') && !line.startsWith('  ')) {
      const tablePart = headerMatch[1];
      const rest = headerMatch[2];
      const op: 'INSERT' | 'UPDATE' | 'DELETE' =
        rest.toLowerCase().includes('update') ? 'UPDATE' :
        rest.toLowerCase().includes('delete') ? 'DELETE' : 'INSERT';
      current = { table: tablePart, op, fields: [] };
      result.push(current);

      // Inline fields after colon on same line
      const fieldStr = rest.replace(/\(.*?\)/g, '').replace(/UPDATE|INSERT|DELETE/gi, '').trim();
      if (fieldStr) {
        fieldStr.split(',').forEach(f => {
          const clean = f.trim();
          if (clean) current!.fields.push({ name: clean, value: '' });
        });
      }
    } else if (current) {
      // field line
      const clean = line.replace(/^[+\-›•\s]+/, '').trim();
      if (clean) {
        const [name, ...rest2] = clean.split('=');
        current.fields.push({ name: name.trim(), value: rest2.join('=').trim() });
      }
    } else if (line) {
      // No table yet — create a generic block
      current = { table: line.replace(/[:=].*/, '').trim() || 'write', op: 'INSERT', fields: [] };
      result.push(current);
    }
  }

  return result.filter(r => r.table);
}

// ─── SQL syntax highlight ─────────────────────────────────────────────────────
function highlightSQL(sql: string): string {
  const KW = ['SELECT','FROM','JOIN','LEFT','INNER','WHERE','ORDER','BY','LIMIT','INSERT','UPDATE',
               'DELETE','INTO','VALUES','SET','ON','AND','OR','NOT','IS','IN','AS','DESC','ASC',
               'COUNT','NULL','COALESCE','GROUP','HAVING','CASE','WHEN','THEN','ELSE','END'];
  let s = sql.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  KW.forEach(k => { s = s.replace(new RegExp(`\\b${k}\\b`, 'g'), `<span class="sk">${k}</span>`); });
  s = s.replace(/'([^']*)'/g, `<span class="ss">'$1'</span>`);
  s = s.replace(/(--[^\n]*)/g, `<span class="scm">$1</span>`);
  return s;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AuditScreen() {
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>DBA Audit — web only</Text>
      </View>
    );
  }
  return <AuditApp />;
}

function AuditApp() {
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [vers, setVers] = useState<Record<string, AuditVerification>>({});
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [snap, setSnap] = useState<{ before: SnapData | null; after: SnapData | null }>({ before: null, after: null });
  const [sheet, setSheet] = useState<Sheet>('matrix');
  const [selId, setSelId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tester] = useState('dev');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null);
  const [verEdit, setVerEdit] = useState<{ status: string; notes: string }>({ status: 'pass', notes: '' });
  const sbRef = useRef<unknown>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' | 'info' = 'ok') => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  // Init Supabase — inject CDN script then connect
  useEffect(() => {
    function tryInit() {
      const win = window as unknown as Record<string, unknown>;
      const client = (win.supabase as { createClient: (u: string, k: string, o: object) => unknown })
        ?.createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
      if (!client) { setTimeout(tryInit, 100); return; }
      sbRef.current = client;
      load(client);
    }

    const existing = document.getElementById('__supabase_cdn');
    if (existing) { tryInit(); return; }

    const script = document.createElement('script');
    script.id = '__supabase_cdn';
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
    script.onload = tryInit;
    document.head.appendChild(script);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync verEdit when sel changes
  useEffect(() => {
    if (!selId) return;
    const v = vers[selId];
    setVerEdit({ status: v?.status ?? 'pass', notes: v?.notes ?? '' });
  }, [selId, vers]);

  type OrderableQuery = Promise<{ data: unknown[]; error: unknown }> & {
    order: (col: string) => OrderableQuery;
  };
  const sb = () => sbRef.current as {
    from: (t: string) => {
      select: (c: string) => OrderableQuery;
      upsert: (d: object, o?: object) => Promise<{ error: unknown }>;
      delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
    };
    rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
  };

  async function load(client?: unknown) {
    const s = (client ?? sbRef.current) as ReturnType<typeof sb>;
    if (!s) return;
    setLoading(true);
    try {
      const [aRes, vRes] = await Promise.all([
        s.from('pulse_audit_actions').select('*').order('seq').order('sub_seq'),
        s.from('pulse_audit_verifications').select('*').order('verified_at'),
      ]);
      if ((aRes as { error: unknown }).error) throw (aRes as { error: Error }).error;
      setActions(((aRes as { data: unknown[] }).data ?? []) as AuditAction[]);
      const verMap: Record<string, AuditVerification> = {};
      for (const v of ((vRes as { data: unknown[] }).data ?? []) as AuditVerification[]) {
        verMap[v.action_id] = v;
      }
      setVers(verMap);
      setConnected(true);
    } catch (e: unknown) {
      showToast('Load failed: ' + (e as Error).message, 'err');
    } finally {
      setLoading(false);
    }
  }

  async function loadCoverage() {
    if (!sb()) return;
    const { data, error } = await sb().rpc('get_trigger_coverage');
    if (error) { showToast('Coverage failed', 'err'); return; }
    setCoverage((data as CoverageRow[]) ?? []);
  }

  async function takeSnap(type: 'before' | 'after') {
    if (!sb()) return;
    const { data, error } = await sb().rpc('get_db_snapshot');
    if (error) { showToast('Snapshot failed', 'err'); return; }
    setSnap(prev => ({ ...prev, [type]: data as SnapData }));
    showToast(`${type === 'before' ? 'Before' : 'After'} snapshot taken`);
  }

  async function saveVerification() {
    if (!selId || !sb()) return;
    const { error } = await sb().from('pulse_audit_verifications').upsert({
      action_id: selId,
      tester_name: tester,
      status: verEdit.status,
      notes: verEdit.notes,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'action_id' });
    if (error) { showToast('Save failed', 'err'); return; }
    setVers(prev => ({ ...prev, [selId]: { action_id: selId, tester_name: tester, status: verEdit.status as 'pass' | 'fail' | 'partial', notes: verEdit.notes } }));
    showToast('Verification saved');
  }

  async function removeVerification() {
    if (!selId || !sb()) return;
    const { error } = await sb().from('pulse_audit_verifications').delete().eq('action_id', selId);
    if (error) { showToast('Remove failed', 'err'); return; }
    setVers(prev => { const n = { ...prev }; delete n[selId]; return n; });
    setVerEdit({ status: 'pass', notes: '' });
    showToast('Verification removed', 'info');
  }

  const selAction = actions.find(a => a.id === selId) ?? null;
  const vCount = Object.keys(vers).length;
  const withTrigger = actions.filter(a => a.trigger_name).length;
  const withAudit = actions.filter(a => a.audit_table).length;

  // ── Render helpers ──────────────────────────────────────────────────────────
  function badge(text: string, cls: string) {
    return `<span class="badge ${cls}">${text}</span>`;
  }
  function priB(p: string) {
    return badge(p, p === 'HIGH' ? 'b-hi' : p === 'MEDIUM' ? 'b-md' : 'b-lo');
  }
  function opBadges(arr: string[], cls: string) {
    if (!arr?.length) return `<span class="cell-dim">—</span>`;
    return arr.map(t => badge(t, cls)).join(' ');
  }

  // ── Matrix sheet ────────────────────────────────────────────────────────────
  function matrixHTML() {
    const letters = ['C','D','E','F','G','H','I','J'];
    const cols = ['ROUTE','SERVICE','INSERTS','UPDATES','TRIGGER','AUDIT TABLE','PRI','✓'];
    let html = `<table class="xtable">
      <thead>
        <tr class="col-hdr">
          <th class="rn th-rn"></th>
          <th class="col-id th-id">A</th>
          <th class="col-action th-action">B</th>
          ${letters.map((l, i) => i < cols.length ? `<th>${l}</th>` : '').join('')}
        </tr>
        <tr class="dh">
          <td class="rn td-rn">1</td>
          <td class="col-id td-id">#</td>
          <td class="col-action td-action">ACTION</td>
          ${cols.map(c => `<td>${c}</td>`).join('')}
        </tr>
      </thead>
      <tbody>`;

    let lastGroup = '';
    actions.forEach((a, i) => {
      if (a.flow_group && a.flow_group !== lastGroup && !a.is_subflow) {
        lastGroup = a.flow_group;
        html += `<tr class="grp">
          <td class="rn"></td>
          <td class="col-id"></td>
          <td class="col-action">${a.flow_group}</td>
          <td colspan="8"></td>
        </tr>`;
      }
      const v = vers[a.id];
      const sel = selId === a.id ? 'sel' : '';
      const sub = a.is_subflow ? 'sub' : '';
      html += `<tr data-id="${a.id}" class="${sel} ${sub}" onclick="window.__auditSelectRow('${a.id}')">
        <td class="rn">${a.is_subflow ? '' : i + 1}</td>
        <td class="col-id">${a.id}</td>
        <td class="col-action">${a.action}</td>
        <td class="cell-file" style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${a.route || '<span class="cell-dim">—</span>'}</td>
        <td class="cell-code" style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${a.service || '<span class="cell-dim">—</span>'}</td>
        <td>${opBadges(a.ins_tables ?? [], 'b-ins')}</td>
        <td>${opBadges(a.upd_tables ?? [], 'b-upd')}</td>
        <td>${a.trigger_name ? badge(a.trigger_name, 'b-trg') : '<span class="cell-dim">—</span>'}</td>
        <td>${a.audit_table ? badge(a.audit_table, 'b-trg') : '<span class="cell-dim">—</span>'}</td>
        <td>${priB(a.priority)}</td>
        <td style="text-align:center">${v ? badge(v.status.toUpperCase(), `b-${v.status}`) : '<span class="cell-dim">—</span>'}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    return html;
  }

  // ── State machine sheet ─────────────────────────────────────────────────────
  function stateHTML() {
    const nodes = [
      { id: 'pending',    label: 'PENDING',    desc: 'trip created' },
      { id: 'assigned',   label: 'ASSIGNED',   desc: 'driver + vehicle' },
      { id: 'started',    label: 'STARTED',    desc: 'OTP verified' },
      { id: 'in-transit', label: 'IN TRANSIT', desc: 'LR uploaded' },
      { id: 'completed',  label: 'COMPLETED',  desc: '→ workflow_events' },
    ];
    const transitions = [
      { from: '—', to: 'pending', action: 'Create Trip', actor: 'dispatcher' },
      { from: 'pending', to: 'assigned', action: 'Assign driver + vehicle', actor: 'dispatcher' },
      { from: 'assigned', to: 'started', action: 'OTP verified at pickup', actor: 'driver' },
      { from: 'started', to: 'in_transit', action: 'LR uploaded', actor: 'driver/dispatcher' },
      { from: 'in_transit', to: 'completed', action: 'POD + delivery done', actor: 'driver/dispatcher' },
      { from: 'pending', to: 'cancelled', action: 'Manual cancel', actor: 'dispatcher' },
      { from: 'assigned', to: 'cancelled', action: 'Manual cancel', actor: 'dispatcher' },
      { from: 'started', to: 'cancelled', action: 'Emergency cancel', actor: 'dispatcher' },
    ];
    return `<div class="sm-sheet">
      <div class="sm-title">Trip Lifecycle — State Machine</div>
      <div class="sm-sub">trips.status · triggers: trg_trip_status_audit → trip_status_audit · trg_log_trip_completed → trip_workflow_events</div>
      <div class="sm-flow">
        ${nodes.map((n, i) => `
          ${i > 0 ? `<div class="sm-arrow"><div class="sm-arr-line"></div><div class="sm-arr-label">${nodes[i - 1].id}→${n.id}</div></div>` : ''}
          <div class="sm-node ${n.id}">
            <div class="sm-status">${n.label}</div>
            <div class="sm-node-desc">${n.desc}</div>
          </div>
        `).join('')}
      </div>
      <div style="font-size:10px;color:var(--ac);letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px">DB writes per transition</div>
      <table class="dtable">
        <thead><tr><th>TRANSITION</th><th>trips UPDATE fields</th><th>TRIGGER</th><th>AUDIT TABLE</th></tr></thead>
        <tbody>
          ${transitions.map(t => `<tr>
            <td><span style="color:var(--upd);font-family:var(--mono);font-weight:700">${t.from} → ${t.to}</span></td>
            <td style="font-family:var(--mono);font-size:10px;color:#9cdcfe">status, updated_at${t.to === 'completed' ? ', completed_at' : ''}</td>
            <td style="color:var(--trg);font-size:10px;font-family:var(--mono)">${t.to === 'completed' ? 'trg_log_trip_completed' : 'trg_trip_status_audit'}</td>
            <td style="color:var(--trg);font-size:10px;font-family:var(--mono)">${t.to === 'completed' ? 'trip_workflow_events' : 'trip_status_audit'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── Coverage sheet ──────────────────────────────────────────────────────────
  function coverageHTML() {
    if (!coverage.length) {
      loadCoverage();
      return `<div style="padding:40px 48px;font-size:11px;color:var(--txm)">Loading pg_catalog data…</div>`;
    }
    const covered = coverage.filter(r => r.trg_count > 1).length;
    const partial = coverage.filter(r => r.trg_count === 1).length;
    const uncov   = coverage.filter(r => r.trg_count === 0).length;
    return `<div class="cov-sheet">
      <div class="sm-title">Audit Coverage — Live from pg_catalog</div>
      <div class="sm-sub" style="margin-bottom:24px">get_trigger_coverage() RPC · ${coverage.length} tables tracked</div>
      <div style="display:flex;gap:12px;margin-bottom:28px;flex-wrap:wrap">
        <div class="snap-box" style="min-width:100px;text-align:center"><div class="snap-val" style="color:var(--ins)">${covered}</div><div class="snap-box-title">Multi-trigger</div></div>
        <div class="snap-box" style="min-width:100px;text-align:center"><div class="snap-val" style="color:var(--ac)">${partial}</div><div class="snap-box-title">Single trigger</div></div>
        <div class="snap-box" style="min-width:100px;text-align:center"><div class="snap-val" style="color:var(--del)">${uncov}</div><div class="snap-box-title">No triggers</div></div>
        <div class="snap-box" style="min-width:100px;text-align:center"><div class="snap-val" style="color:var(--trg)">${coverage.filter(r => r.has_rls).length}/${coverage.length}</div><div class="snap-box-title">RLS enabled</div></div>
      </div>
      <div style="overflow-x:auto">
      <table class="dtable">
        <thead><tr><th>TABLE</th><th>RLS</th><th>TRIGGERS</th><th>COUNT</th><th>COVERAGE</th></tr></thead>
        <tbody>
          ${coverage.map(r => {
            const pct = Math.min(100, r.trg_count * 30 + (r.has_rls ? 20 : 0));
            const cls = pct >= 70 ? 'hi' : pct >= 30 ? 'md' : 'lo';
            return `<tr>
              <td style="color:#CDB4DB;font-family:var(--mono);font-size:11px">${r.tbl}</td>
              <td style="text-align:center">${r.has_rls ? '<span style="color:var(--ins)">✔</span>' : '<span style="color:var(--del)">✘</span>'}</td>
              <td style="font-size:10px;color:var(--trg);font-family:var(--mono)">${r.trg_names?.join(', ') || '—'}</td>
              <td style="text-align:center;font-family:var(--mono);color:${r.trg_count > 0 ? 'var(--ins)' : 'var(--del)'}">${r.trg_count}</td>
              <td><span class="pbar-track"><span class="pbar-fill ${cls}" style="width:${pct}%"></span></span> <span style="font-size:10px;margin-left:6px">${pct}%</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
    </div>`;
  }

  // ── SQL sheet ───────────────────────────────────────────────────────────────
  function sqlHTML() {
    const GLOBAL = `SELECT
  (SELECT COUNT(*) FROM trips)                      AS trips,
  (SELECT COUNT(*) FROM trip_assignment_audit)      AS assignment_audit,
  (SELECT COUNT(*) FROM trip_workflow_events)       AS workflow_events,
  (SELECT COUNT(*) FROM trip_status_audit)          AS status_audit,
  (SELECT COUNT(*) FROM trip_location_checkpoints)  AS loc_pings,
  (SELECT COUNT(*) FROM trip_documents)             AS documents,
  (SELECT COUNT(*) FROM transactions)               AS transactions,
  (SELECT COUNT(*) FROM workspace_audit_log)        AS workspace_audit,
  (SELECT COUNT(*) FROM indents)                    AS indents,
  (SELECT COUNT(*) FROM network_bids)               AS bids;`;

    function block(title: string, tag: string, sql: string) {
      const escaped = sql.replace(/`/g, "'");
      return `<div class="sql-block">
        <div class="sql-block-head">
          <div>
            <div class="sql-block-title">${title}</div>
            <div style="font-size:9px;color:var(--txd);margin-top:1px">${tag}</div>
          </div>
          <button class="sql-copy-btn" onclick="navigator.clipboard.writeText(\`${escaped}\`)">COPY</button>
        </div>
        <div class="sql-code">${highlightSQL(sql)}</div>
      </div>`;
    }

    const actionBlocks = actions.slice(0, 6).map(a =>
      a.verify_sql ? block(`${a.id}. ${a.action}`, (a.ins_tables ?? []).concat(a.upd_tables ?? []).join(', '), a.verify_sql) : ''
    ).join('');

    return `<div class="sql-sheet">
      <div class="sm-title">Snapshot SQL Reference</div>
      <div class="sm-sub" style="margin-bottom:24px">Click COPY to clipboard · Action SQLs load from DB</div>
      <div class="sql-grid">
        ${block('Global State Snapshot', 'before/after any action', GLOBAL)}
        ${actionBlocks}
      </div>
    </div>`;
  }

  // ── Log sheet ───────────────────────────────────────────────────────────────
  function logHTML() {
    const pct = actions.length ? Math.round(vCount / actions.length * 100) : 0;
    const rows = actions.map(a => {
      const v = vers[a.id];
      const done = !!v;
      return `<tr style="${done ? 'opacity:.7' : ''}">
        <td style="text-align:center"><input type="checkbox" class="vchk" ${done ? 'checked' : ''} onchange="window.__auditToggleVer('${a.id}',this.checked)"></td>
        <td style="font-family:var(--mono);color:var(--ac)">${a.id}</td>
        <td style="font-weight:600">${a.action}</td>
        <td>${priB(a.priority)}</td>
        <td style="font-size:10px;font-family:var(--mono);color:#9cdcfe">${(a.ins_tables ?? []).concat(a.upd_tables ?? []).slice(0, 3).join(', ') || '—'}</td>
        <td>${a.audit_table ? badge(a.audit_table, 'b-trg') : '<span class="cell-dim">—</span>'}</td>
        <td>${done ? badge(v.status.toUpperCase(), `b-${v.status}`) : '<span class="cell-dim">—</span>'}</td>
        <td style="font-size:10px;color:var(--txd)">${v?.verified_at ? new Date(v.verified_at).toISOString().slice(0, 10) : '—'}</td>
        <td style="font-size:10px;color:var(--upd)">${v?.tester_name || '—'}</td>
      </tr>`;
    }).join('');
    return `<div class="log-sheet">
      <div class="sm-title">Verification Log</div>
      <div class="sm-sub" style="margin-bottom:20px">Live via Supabase Realtime · tester: ${tester}</div>
      <div class="log-progress">
        <div>
          <div style="font-size:9px;color:var(--txd);letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px">Verified</div>
          <span style="font-size:32px;font-family:var(--mono);color:var(--ac)">${vCount}</span>
          <span style="font-size:14px;color:var(--txm)"> / ${actions.length}</span>
        </div>
        <div class="log-prog-bar"><div class="log-prog-fill" style="width:${pct}%"></div></div>
        <div>
          <div style="font-size:9px;color:var(--txd);letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px">Coverage</div>
          <span style="font-size:28px;font-family:var(--mono);color:var(--ins)">${pct}%</span>
        </div>
      </div>
      <div style="overflow-x:auto">
      <table class="dtable">
        <thead><tr><th>✓</th><th>#</th><th>ACTION</th><th>PRI</th><th>TABLES</th><th>AUDIT TABLE</th><th>STATUS</th><th>DATE</th><th>TESTER</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
    </div>`;
  }

  // ── Detail panel ─────────────────────────────────────────────────────────────
  function renderDetailPanel() {
    if (!selAction) return null;
    const v = vers[selAction.id];
    const writes = parseDataDetail(selAction.data_detail ?? '');

    // Try to parse JSON summary
    let jsonSummary = '';
    try {
      const obj = JSON.parse(selAction.data_detail ?? '{}');
      jsonSummary = obj.summary ?? '';
    } catch (_) { /* */ }

    return (
      <div className="detail-panel open">
        {/* Head */}
        <div className="dp-head">
          <div className="dp-id-badge">{selAction.id}</div>
          <div className="dp-title-wrap">
            <div className="dp-title">{selAction.action}</div>
            <div className="dp-sub">{selAction.flow_group ?? 'General'} · {selAction.priority}</div>
          </div>
          <button className="dp-close" onClick={() => setSelId(null)}>✕</button>
        </div>

        <div className="dp-body">
          {/* Status chips */}
          <div className="dp-status-row" dangerouslySetInnerHTML={{ __html: [
            priB(selAction.priority),
            v ? `<span class="badge b-${v.status}">${v.status.toUpperCase()}</span>` : '<span class="badge b-lo">UNVERIFIED</span>',
            selAction.trigger_name ? `<span class="badge b-trg">⚡ ${selAction.trigger_name}</span>` : '',
            selAction.audit_table  ? `<span class="badge b-trg">🗄 ${selAction.audit_table}</span>` : '',
          ].join(' ') }} />

          {/* Summary */}
          {jsonSummary && (
            <div className="dp-section">
              <div className="dp-section-label">Summary</div>
              <div style={{ fontSize: 12, color: 'var(--txm)', lineHeight: 1.7 }}>{jsonSummary}</div>
            </div>
          )}

          {/* Route + Service */}
          <div className="dp-section">
            <div className="dp-section-label">Route & Service</div>
            {selAction.route && <div className="route-path">{selAction.route}</div>}
            {selAction.service && <div className="route-path" style={{ color: '#9cdcfe', marginTop: 4 }}>{selAction.service}</div>}
          </div>

          {/* Data flow cards */}
          {writes.length > 0 && (
            <div className="dp-section">
              <div className="dp-section-label">Data Written</div>
              {writes.map((w, i) => (
                <div key={i} className="flow-card">
                  <div className="flow-card-head">
                    <span className="flow-card-name">{w.table}</span>
                    <span className={`flow-card-op badge ${w.op === 'INSERT' ? 'b-ins' : w.op === 'UPDATE' ? 'b-upd' : 'b-del'}`}>{w.op}</span>
                  </div>
                  {w.fields.length > 0 && (
                    <div className="flow-card-fields">
                      {w.fields.map((f, j) => (
                        <div key={j} className="flow-field">
                          <span className="flow-field-name">{f.name}</span>
                          {f.value && <span className="flow-field-val">= {f.value}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Snapshot compare */}
          {(snap.before || snap.after) && (() => {
            const tbl = selAction.ins_tables?.[0] ?? selAction.upd_tables?.[0];
            if (!tbl) return null;
            const b = snap.before ? (snap.before[tbl] as number) : null;
            const a = snap.after  ? (snap.after[tbl]  as number) : null;
            const diff = (a !== null && b !== null) ? a - b : null;
            return (
              <div className="dp-section">
                <div className="dp-section-label">Snapshot — {tbl}</div>
                <div className="snap-compare">
                  <div className="snap-box">
                    <div className="snap-box-title">Before</div>
                    <div className="snap-val">{b ?? '—'}</div>
                  </div>
                  <div className="snap-box">
                    <div className="snap-box-title">After</div>
                    <div className="snap-val">{a ?? '—'}</div>
                    {diff !== null && <div className={`snap-diff ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'zero'}`}>{diff > 0 ? `+${diff}` : diff}</div>}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Verify SQL */}
          {selAction.verify_sql && (
            <div className="dp-section">
              <div className="dp-section-label">Verification SQL</div>
              <div className="sql-block">
                <div className="sql-block-head">
                  <span className="sql-block-title">Run to verify</span>
                  <button className="sql-copy-btn" onClick={() => { navigator.clipboard.writeText(selAction.verify_sql!); showToast('SQL copied'); }}>COPY</button>
                </div>
                <div className="sql-code" dangerouslySetInnerHTML={{ __html: highlightSQL(selAction.verify_sql) }} />
              </div>
            </div>
          )}

          {/* Verification form */}
          <div className="dp-section">
            <div className="dp-section-label">Mark Verification</div>
            <div className="verify-form">
              <div className="verify-row">
                <span className="verify-label">Status</span>
                <select className="ver-select" value={verEdit.status} onChange={e => setVerEdit(p => ({ ...p, status: e.target.value }))}>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="partial">Partial</option>
                </select>
              </div>
              <div className="verify-row">
                <span className="verify-label">Notes</span>
                <input className="ver-input" placeholder="optional notes…" value={verEdit.notes} onChange={e => setVerEdit(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="ver-save-btn" onClick={saveVerification}>Save</button>
                {v && <button className="ver-save-btn" style={{ background: 'var(--delb)', color: 'var(--del)', border: '1px solid rgba(240,113,120,.3)' }} onClick={removeVerification}>Remove</button>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Wire up global row click + verify toggle ────────────────────────────────
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    win.__auditSelectRow = (id: string) => setSelId(id);
    win.__auditToggleVer = async (id: string, checked: boolean) => {
      if (!sb()) return;
      if (checked) {
        await sb().from('pulse_audit_verifications').upsert({
          action_id: id, tester_name: tester, status: 'pass',
          verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: 'action_id' });
        setVers(prev => ({ ...prev, [id]: { action_id: id, tester_name: tester, status: 'pass' } }));
      } else {
        await sb().from('pulse_audit_verifications').delete().eq('action_id', id);
        setVers(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tester, vers]);

  // ── Active sheet content ────────────────────────────────────────────────────
  function sheetContent() {
    switch (sheet) {
      case 'matrix':   return matrixHTML();
      case 'state':    return stateHTML();
      case 'coverage': return coverageHTML();
      case 'sql':      return sqlHTML();
      case 'log':      return logHTML();
    }
  }

  const TABS: { id: Sheet; label: string }[] = [
    { id: 'matrix',   label: '📋 Data Flow Matrix' },
    { id: 'state',    label: '🔄 Trip State Machine' },
    { id: 'coverage', label: '🛡 Audit Coverage' },
    { id: 'sql',      label: '🔍 Snapshot SQL' },
    { id: 'log',      label: '✅ Verify Log' },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HTML_STYLE }} />

      <div className="shell">
        {/* Titlebar */}
        <div className="titlebar">
          <div className="brand">⚡</div>
          <div className="brand-name"><em>Pulse Logistics</em> · DBA Audit</div>
          <span className="tester-tag">tester: {tester}</span>
          <div className={`conn-pill ${connected ? 'on' : 'off'}`}>
            <div className="conn-dot" />
            {connected ? 'CONNECTED' : 'CONNECTING'}
          </div>
        </div>

        {/* Ribbon */}
        <div className="ribbon">
          <div className="rg">
            <span className="rg-lbl">Home</span>
            <button className="rbtn" onClick={() => load()}>⟳ Refresh</button>
          </div>
          <div className="rg">
            <span className="rg-lbl">DBA</span>
            <button className="rbtn" onClick={() => takeSnap('before')}>◀ Before</button>
            <button className="rbtn" onClick={() => takeSnap('after')}>After ▶</button>
            {snap.before && <span style={{ fontSize: 10, color: 'var(--ins)', padding: '0 4px' }}>✔ before</span>}
            {snap.after  && <span style={{ fontSize: 10, color: 'var(--upd)', padding: '0 4px' }}>✔ after</span>}
          </div>
          <span className="status-txt">{actions.length} actions · {vCount} verified</span>
        </div>

        {/* Stats bar */}
        <div className="stats-bar">
          <div className="stat"><div className="stat-val ac">{actions.length}</div><div className="stat-lbl">Total actions</div></div>
          <div className="stat"><div className="stat-val ins">{withTrigger}</div><div className="stat-lbl">Auto triggers</div></div>
          <div className="stat"><div className="stat-val upd">{withAudit}</div><div className="stat-lbl">Audit covered</div></div>
          <div className="stat"><div className="stat-val del">{actions.length - withAudit}</div><div className="stat-lbl">Blind spots</div></div>
          <div className="stat"><div className="stat-val trg">{vCount}/{actions.length}</div><div className="stat-lbl">Verified</div></div>
        </div>

        {/* Main */}
        <div className="main">
          <div className="grid-wrap">
            {loading && <div className="lbar active" />}
            <div dangerouslySetInnerHTML={{ __html: sheetContent() }} />
          </div>
          {renderDetailPanel()}
        </div>

        {/* Tabs */}
        <div className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={`tab ${sheet === t.id ? 'active' : ''}`} onClick={() => { setSheet(t.id); setSelId(null); }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && <div className={`toast show ${toast.type}`}>{toast.msg}</div>}
    </>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0e13' },
  fallbackText: { color: '#8da0b8', fontSize: 14 },
});
