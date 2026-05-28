import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

type MatrixStatus = "PASS" | "WARN" | "FAIL";

interface MatrixRow {
  check: string;
  status: MatrixStatus;
  value: string;
  detail: string;
}

function runLinkedQuery(sql: string): Record<string, unknown>[] {
  const escaped = sql.replace(/"/g, '\\"');
  const cmd = `supabase --output-format json db query "${escaped}" --linked`;
  const stdout = execSync(cmd, {
    cwd: process.cwd(),
    stdio: "pipe",
    encoding: "utf8",
  });
  const firstBrace = stdout.indexOf("{");
  if (firstBrace < 0) {
    throw new Error(`Unable to parse query output: ${stdout}`);
  }
  const jsonRaw = stdout.slice(firstBrace).trim();
  const parsed = JSON.parse(jsonRaw) as { rows?: Record<string, unknown>[] };
  return parsed.rows ?? [];
}

function runRgCount(pattern: string, paths: string[]): number {
  const regex = new RegExp(pattern, "gm");
  const root = process.cwd();
  const allowed = new Set([".ts", ".tsx", ".js", ".jsx"]);
  let count = 0;
  const walk = (absolutePath: string) => {
    if (!existsSync(absolutePath)) return;
    const info = statSync(absolutePath);
    if (info.isDirectory()) {
      for (const name of readdirSync(absolutePath)) {
        walk(join(absolutePath, name));
      }
      return;
    }
    if (!allowed.has(extname(absolutePath))) return;
    const content = readFileSync(absolutePath, "utf8");
    regex.lastIndex = 0;
    const matches = content.match(regex);
    if (matches?.length) count += matches.length;
  };
  for (const relativePath of paths) {
    walk(join(root, relativePath));
  }
  return count;
}

function readCount(rows: Record<string, unknown>[], key: string): number {
  const raw = rows[0]?.[key];
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toStatus(value: number, failAt = 1, warnAt = 1): MatrixStatus {
  if (value >= failAt) return "FAIL";
  if (value >= warnAt) return "WARN";
  return "PASS";
}

function emitMatrix(rows: MatrixRow[]) {
  const header = ["Check", "Status", "Value", "Detail"];
  const widths = header.map((h, idx) =>
    Math.max(
      h.length,
      ...rows.map((r) => [r.check, r.status, r.value, r.detail][idx].length),
    ),
  );
  const line = (cols: string[]) =>
    `| ${cols.map((c, i) => c.padEnd(widths[i], " ")).join(" | ")} |`;
  console.log(line(header));
  console.log(`|-${widths.map((w) => "-".repeat(w)).join("-|-")}-|`);
  for (const row of rows) {
    console.log(line([row.check, row.status, row.value, row.detail]));
  }
}

function main() {
  const matrix: MatrixRow[] = [];

  const duplicateTripCodes = readCount(
    runLinkedQuery(
      "select count(*) as duplicate_trip_operational_code from (select trip_operational_code from public.trips where trip_operational_code is not null group by trip_operational_code having count(*) > 1) q;",
    ),
    "duplicate_trip_operational_code",
  );
  matrix.push({
    check: "Duplicate trip_operational_code",
    status: toStatus(duplicateTripCodes),
    value: String(duplicateTripCodes),
    detail: duplicateTripCodes === 0 ? "No collisions" : "Operational code collisions detected",
  });

  const duplicateIndentCodes = readCount(
    runLinkedQuery(
      "select count(*) as duplicate_indent_operational_code from (select indent_operational_code from public.indents where indent_operational_code is not null group by indent_operational_code having count(*) > 1) q;",
    ),
    "duplicate_indent_operational_code",
  );
  matrix.push({
    check: "Duplicate indent_operational_code",
    status: toStatus(duplicateIndentCodes),
    value: String(duplicateIndentCodes),
    detail: duplicateIndentCodes === 0 ? "No collisions" : "Indent operational code collisions detected",
  });

  const missingLineage = readCount(
    runLinkedQuery(
      "select count(*) as missing_lineage_references from public.trips where source_indent_id is not null and coalesce(nullif(btrim(source_indent_code),''), nullif(btrim(indent_reference_code),'')) is null;",
    ),
    "missing_lineage_references",
  );
  matrix.push({
    check: "Missing lineage references",
    status: toStatus(missingLineage),
    value: String(missingLineage),
    detail: missingLineage === 0 ? "Lineage references complete" : "Trips missing source indent reference",
  });

  const tripsWithoutCode = readCount(
    runLinkedQuery(
      "select count(*) as trips_without_operational_code from public.trips where coalesce(nullif(btrim(trip_operational_code),''), nullif(btrim(trip_code),'')) is null;",
    ),
    "trips_without_operational_code",
  );
  matrix.push({
    check: "Trips without operational code",
    status: toStatus(tripsWithoutCode),
    value: String(tripsWithoutCode),
    detail: tripsWithoutCode === 0 ? "All trips have operational references" : "Some trips missing operational code",
  });

  const aggregationPosted = readCount(
    runLinkedQuery(
      "select count(*) as aggregation_with_vehicle_postings from public.vehicle_ledger_entries vle join public.trips t on t.id = vle.trip_id where (lower(coalesce(t.trip_payout_mode,'')) = 'market' or (coalesce(t.trip_payout_mode,'') = '' and t.supplier_id is not null));",
    ),
    "aggregation_with_vehicle_postings",
  );
  matrix.push({
    check: "Aggregation trips posting to vehicle ledger",
    status: toStatus(aggregationPosted),
    value: String(aggregationPosted),
    detail: aggregationPosted === 0 ? "Accounting boundary preserved" : "Aggregation posting leak detected",
  });

  const duplicateLedgerPosts = readCount(
    runLinkedQuery(
      "select count(*) as duplicate_vehicle_source_posts from (select source_type, source_id from public.vehicle_ledger_entries group by source_type, source_id having count(*) > 1) d;",
    ),
    "duplicate_vehicle_source_posts",
  );
  matrix.push({
    check: "Duplicate vehicle ledger source postings",
    status: toStatus(duplicateLedgerPosts),
    value: String(duplicateLedgerPosts),
    detail: duplicateLedgerPosts === 0 ? "Idempotency key holds" : "Duplicate posting keys detected",
  });

  const invalidPostingStates = readCount(
    runLinkedQuery(
      "select count(*) as invalid_posting_states from (select posting_state from public.trip_fuel_entries union all select posting_state from public.trip_toll_entries) s where posting_state is null or posting_state not in ('pending','approved','posted','rejected','failed');",
    ),
    "invalid_posting_states",
  );
  matrix.push({
    check: "Invalid posting states",
    status: toStatus(invalidPostingStates),
    value: String(invalidPostingStates),
    detail: invalidPostingStates === 0 ? "Posting states valid" : "Unexpected posting_state values found",
  });

  const orphanMaintenance = readCount(
    runLinkedQuery(
      "select count(*) as orphaned_maintenance_rows from public.vehicle_maintenance_entries vm left join public.vehicles v on v.id = vm.vehicle_id left join public.trips t on t.id = vm.trip_id where v.id is null or (vm.trip_id is not null and t.id is null);",
    ),
    "orphaned_maintenance_rows",
  );
  matrix.push({
    check: "Orphaned maintenance rows",
    status: toStatus(orphanMaintenance),
    value: String(orphanMaintenance),
    detail: orphanMaintenance === 0 ? "Maintenance references valid" : "Orphan maintenance rows found",
  });

  const invalidApprovalTransitions = readCount(
    runLinkedQuery(
      "select count(*) as invalid_approval_transitions from (select approval_state, approved_at, approved_by, posting_state from public.trip_fuel_entries union all select approval_state, approved_at, approved_by, posting_state from public.trip_toll_entries) s where ((approval_state in ('approved','settled')) and approved_at is null) or ((approval_state = 'rejected') and posting_state = 'posted');",
    ),
    "invalid_approval_transitions",
  );
  matrix.push({
    check: "Invalid approval transitions",
    status: toStatus(invalidApprovalTransitions),
    value: String(invalidApprovalTransitions),
    detail: invalidApprovalTransitions === 0 ? "Approval lifecycle consistent" : "Approval lifecycle anomalies found",
  });

  const invalidReimbursementStates = readCount(
    runLinkedQuery(
      "select count(*) as invalid_reimbursement_states from (select payment_owner, reimbursement_state, reimbursed_at from public.trip_fuel_entries union all select payment_owner, reimbursement_state, reimbursed_at from public.trip_toll_entries) s where reimbursement_state not in ('reported','approved','reimbursement_pending','reimbursed','rejected') or (reimbursement_state = 'reimbursed' and reimbursed_at is null) or (payment_owner <> 'driver' and reimbursement_state = 'reimbursement_pending');",
    ),
    "invalid_reimbursement_states",
  );
  matrix.push({
    check: "Invalid reimbursement states",
    status: toStatus(invalidReimbursementStates),
    value: String(invalidReimbursementStates),
    detail: invalidReimbursementStates === 0 ? "Reimbursement lifecycle valid" : "Reimbursement lifecycle anomalies found",
  });

  const approvalQueueInconsistencies = readCount(
    runLinkedQuery(
      "select count(*) as approval_queue_inconsistencies from (select approval_state, approved_at, approved_by from public.trip_fuel_entries union all select approval_state, approved_at, approved_by from public.trip_toll_entries) s where approval_state in ('reported','review_pending') and (approved_at is not null or approved_by is not null);",
    ),
    "approval_queue_inconsistencies",
  );
  matrix.push({
    check: "Approval queue correctness",
    status: toStatus(approvalQueueInconsistencies),
    value: String(approvalQueueInconsistencies),
    detail:
      approvalQueueInconsistencies === 0
        ? "Pending approvals are unapproved rows only"
        : "Queue contains rows already marked approved",
  });

  const reconciliationMismatchConsistency = readCount(
    runLinkedQuery(
      "with ops as (select 'fuel'::text as source_type, f.id as source_id, f.trip_id, f.posting_state, f.approval_state, f.payment_owner from public.trip_fuel_entries f union all select 'toll'::text as source_type, t.id as source_id, t.trip_id, t.posting_state, t.approval_state, t.payment_owner from public.trip_toll_entries t), should_post as (select o.*, tr.trip_payout_mode, tr.supplier_id, ((lower(coalesce(tr.trip_payout_mode,'')) = 'asset' or (coalesce(tr.trip_payout_mode,'') = '' and tr.supplier_id is null)) and o.approval_state = 'approved' and lower(coalesce(o.payment_owner,'')) in ('organization','fleet_card')) as expected_posting from ops o join public.trips tr on tr.id = o.trip_id), joined as (select s.*, (vle.id is not null) as has_ledger_entry from should_post s left join public.vehicle_ledger_entries vle on vle.source_type = s.source_type and vle.source_id = s.source_id) select count(*) as reconciliation_mismatch_consistency from joined where (expected_posting and not has_ledger_entry and posting_state = 'posted') or (not expected_posting and has_ledger_entry and (lower(coalesce(trip_payout_mode,'')) = 'market' or supplier_id is not null));",
    ),
    "reconciliation_mismatch_consistency",
  );
  matrix.push({
    check: "Reconciliation mismatch consistency",
    status: toStatus(reconciliationMismatchConsistency),
    value: String(reconciliationMismatchConsistency),
    detail:
      reconciliationMismatchConsistency === 0
        ? "Mismatch state agrees with ledger presence"
        : "Posting state and ledger presence diverged",
  });

  const duplicatePreventionIntegrity = readCount(
    runLinkedQuery(
      "select count(*) as duplicate_prevention_integrity from (select source_type, source_id, count(*) as c from public.vehicle_ledger_entries group by source_type, source_id) d where d.c > 1;",
    ),
    "duplicate_prevention_integrity",
  );
  matrix.push({
    check: "Duplicate prevention integrity",
    status: toStatus(duplicatePreventionIntegrity),
    value: String(duplicatePreventionIntegrity),
    detail:
      duplicatePreventionIntegrity === 0
        ? "No duplicate source postings"
        : "Duplicate source postings detected",
  });

  const sequenceDrift = readCount(
    runLinkedQuery(
      "with trip_max as (select organization_id, coalesce(max((regexp_match(coalesce(trip_operational_code, trip_code), '([0-9]+)$'))[1]::bigint),0) as max_seq from public.trips group by organization_id), indent_max as (select organization_id, coalesce(max((regexp_match(coalesce(indent_operational_code, indent_code), '([0-9]+)$'))[1]::bigint),0) as max_seq from public.indents group by organization_id), expected as (select organization_id, 'trip'::text as entity_type, max_seq from trip_max union all select organization_id, 'indent'::text as entity_type, max_seq from indent_max) select count(*) as operational_sequence_drift from expected e left join public.operational_sequences s on s.organization_id = e.organization_id and s.entity_type = e.entity_type where coalesce(s.current_value,0) < e.max_seq;",
    ),
    "operational_sequence_drift",
  );
  matrix.push({
    check: "Operational sequence drift",
    status: toStatus(sequenceDrift),
    value: String(sequenceDrift),
    detail: sequenceDrift === 0 ? "Sequence counters aligned" : "Sequence table behind generated codes",
  });

  const missingTriggers = readCount(
    runLinkedQuery(
      "select count(*) as missing_required_triggers from (select unnest(array['trg_set_trip_operational_code','trg_set_indent_operational_code']) as trigger_name) expected left join pg_trigger t on t.tgname = expected.trigger_name and not t.tgisinternal where t.oid is null;",
    ),
    "missing_required_triggers",
  );
  matrix.push({
    check: "Required identity triggers present",
    status: toStatus(missingTriggers),
    value: String(missingTriggers),
    detail: missingTriggers === 0 ? "Triggers detected" : "Expected triggers missing",
  });

  const staleLegacyDisplayLeakage = runRgCount(
    "\\.(trip_number|indent_number|display_trip_id|display_indent_id)",
    [
      "features/driver",
      "features/network",
      "features/chat/components",
      "features/finance/components",
      "features/ledger/reconciliation",
      "features/trips/components",
    ],
  );
  matrix.push({
    check: "Stale legacy display leakage",
    status: staleLegacyDisplayLeakage === 0 ? "PASS" : "WARN",
    value: String(staleLegacyDisplayLeakage),
    detail:
      staleLegacyDisplayLeakage === 0
        ? "No direct legacy display references in key surfaces"
        : "Legacy display references still present in UI surfaces",
  });

  const centralizedInvalidationCoverage = runRgCount(
    "invalidateTripOperationalState|invalidateLedgerState|invalidateReconciliationState|invalidateOperationalIdentity|syncOperationalFinanceProjection",
    [
      "features/trips/operations/queries/useTripOperations.ts",
      "features/operations/control-center/hooks/useOperationsBatchActions.ts",
      "features/ledger/vehicle/reconciliation/usePostingReconciliation.ts",
      "features/ledger/reconciliation/useLedgerReconciliation.ts",
      "features/network/hooks/useTripDeployment.ts",
      "features/trips/operations/hooks/useTripOperationsSync.ts",
    ],
  );
  matrix.push({
    check: "Missing invalidations coverage",
    status: centralizedInvalidationCoverage >= 10 ? "PASS" : "FAIL",
    value: String(centralizedInvalidationCoverage),
    detail:
      centralizedInvalidationCoverage >= 10
        ? "Centralized invalidation wiring detected"
        : "Operational mutation invalidation coverage too low",
  });

  const orphanedProjectionStates = readCount(
    runLinkedQuery(
      "with ops as (select 'fuel'::text as source_type, id as source_id, trip_id, approval_state, posting_state from public.trip_fuel_entries union all select 'toll'::text as source_type, id as source_id, trip_id, approval_state, posting_state from public.trip_toll_entries), joined as (select o.*, (vle.id is not null) as has_ledger from ops o left join public.vehicle_ledger_entries vle on vle.source_type = o.source_type and vle.source_id = o.source_id) select count(*) as orphaned_projection_states from joined where approval_state = 'approved' and posting_state = 'posted' and has_ledger = false;",
    ),
    "orphaned_projection_states",
  );
  matrix.push({
    check: "Orphaned projection states",
    status: toStatus(orphanedProjectionStates),
    value: String(orphanedProjectionStates),
    detail:
      orphanedProjectionStates === 0
        ? "Posting state aligns with ledger projection"
        : "Approved-posted entries missing ledger projection row",
  });

  const reimbursementProjectionMismatch = readCount(
    runLinkedQuery(
      "select count(*) as reimbursement_projection_mismatch from (select payment_owner, reimbursement_state, reimbursed_at, approval_state from public.trip_fuel_entries union all select payment_owner, reimbursement_state, reimbursed_at, approval_state from public.trip_toll_entries) s where (lower(coalesce(payment_owner,'')) = 'driver' and reimbursement_state = 'reimbursed' and (reimbursed_at is null or approval_state not in ('approved','settled'))) or (lower(coalesce(payment_owner,'')) <> 'driver' and reimbursement_state in ('reimbursement_pending','reimbursed'));",
    ),
    "reimbursement_projection_mismatch",
  );
  matrix.push({
    check: "Reimbursement projection mismatch",
    status: toStatus(reimbursementProjectionMismatch),
    value: String(reimbursementProjectionMismatch),
    detail:
      reimbursementProjectionMismatch === 0
        ? "Reimbursement projection matches owner + lifecycle"
        : "Reimbursement projection/owner mismatch found",
  });

  const staleReconciliationMarkers = readCount(
    runLinkedQuery(
      "with ops as (select 'fuel'::text as source_type, id as source_id, posting_state from public.trip_fuel_entries union all select 'toll'::text as source_type, id as source_id, posting_state from public.trip_toll_entries), joined as (select o.*, (vle.id is not null) as has_ledger from ops o left join public.vehicle_ledger_entries vle on vle.source_type = o.source_type and vle.source_id = o.source_id) select count(*) as stale_reconciliation_markers from joined where (posting_state = 'failed' and has_ledger = true) or (posting_state = 'posted' and has_ledger = false);",
    ),
    "stale_reconciliation_markers",
  );
  matrix.push({
    check: "Stale reconciliation markers",
    status: toStatus(staleReconciliationMarkers),
    value: String(staleReconciliationMarkers),
    detail:
      staleReconciliationMarkers === 0
        ? "Reconciliation markers match ledger reality"
        : "Reconciliation markers diverged from ledger state",
  });

  const driverSyncDriftSignals = runRgCount("useTripOperationsSync\\(", [
    "features/driver/components",
    "app/(driver)",
  ]);
  matrix.push({
    check: "Driver sync drift coverage",
    status: driverSyncDriftSignals >= 2 ? "PASS" : "FAIL",
    value: String(driverSyncDriftSignals),
    detail:
      driverSyncDriftSignals >= 2
        ? "Driver surfaces wired to operations sync hook"
        : "Driver sync hook coverage is insufficient",
  });

  const duplicateOperationalDisplayRefs = runRgCount(
    "display_trip_id\\s*\\?\\?\\s*[^\\n]*trip_number|display_indent_id\\s*\\?\\?\\s*[^\\n]*indent_number",
    [
      "features/chat/components",
      "features/finance/components",
      "features/network",
      "features/driver",
    ],
  );
  matrix.push({
    check: "Duplicate operational display refs",
    status: duplicateOperationalDisplayRefs === 0 ? "PASS" : "WARN",
    value: String(duplicateOperationalDisplayRefs),
    detail:
      duplicateOperationalDisplayRefs === 0
        ? "No direct legacy fallback chains in key surfaces"
        : "Legacy fallback chains still present; continue normalization sweep",
  });

  emitMatrix(matrix);
  const hasFail = matrix.some((row) => row.status === "FAIL");
  process.exitCode = hasFail ? 1 : 0;
}

main();
