export type SheetName = 'flow' | 'state' | 'coverage' | 'sql' | 'log';
export type DetailView = 'text' | 'table' | 'live' | 'compare';
export type ConnStatus = 'ok' | 'loading' | 'err';
export type ToastType = 'info' | 'ok' | 'err';

export interface AuditAction {
  id: string;
  seq: number;
  sub_seq?: number | null;
  action: string;
  route?: string | null;
  service?: string | null;
  ins_tables?: string[] | null;
  upd_tables?: string[] | null;
  del_tables?: string[] | null;
  trigger_name?: string | null;
  audit_table?: string | null;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW' | string | null;
  verify_sql?: string | null;
  data_detail?: string | null;
  flow_group?: string | null;
  is_subflow?: boolean | null;
}

export interface AuditVerification {
  id?: string;
  action_id: string;
  status?: string | null;
  verified_at?: string | null;
  tester_name?: string | null;
  notes?: string | null;
  updated_at?: string | null;
}

export interface CoverageRow {
  tbl: string;
  has_rls: boolean;
  trg_count: number;
  trg_names: string[] | null;
}

export interface DbColumn {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  ordinal_position: number;
}

export interface ParsedField {
  name: string;
  value: string;
  optional?: boolean;
}

export interface ParsedTableSection {
  title: string;
  fields: ParsedField[];
  tableRef?: string;
}

export interface LiveTableResult {
  rows: Record<string, unknown>[];
  error: string | null;
}

export interface SchemaTableResult {
  columns: DbColumn[];
  error: string | null;
}

export interface AuditConfig {
  url?: string;
  key?: string;
  name?: string;
}

export type SnapshotData = Record<string, number | string> & { snapped_at?: string };
