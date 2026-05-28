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

  const approvedWithoutLedger = readCount(
    runLinkedQuery(
      "with ops as (select 'fuel'::text as source_type, f.id as source_id, f.trip_id, f.approval_state, f.payment_owner, f.status from public.trip_fuel_entries f union all select 'toll'::text as source_type, t.id as source_id, t.trip_id, t.approval_state, t.payment_owner, t.status from public.trip_toll_entries t), eligible as (select o.* from ops o join public.trips tr on tr.id = o.trip_id where o.approval_state in ('approved','settled') and lower(coalesce(o.payment_owner,'')) in ('organization','fleet_card','driver','supplier') and lower(coalesce(o.status,'')) not in ('void','voided') and tr.vehicle_id is not null and (lower(coalesce(tr.trip_payout_mode,'')) = 'asset' or (coalesce(tr.trip_payout_mode,'') = '' and tr.supplier_id is null))) select count(*) as approved_without_ledger from eligible e left join public.vehicle_ledger_entries vle on vle.source_type = e.source_type and vle.source_id = e.source_id where vle.id is null;",
    ),
    "approved_without_ledger",
  );
  matrix.push({
    check: "approved_without_ledger",
    status: toStatus(approvedWithoutLedger),
    value: String(approvedWithoutLedger),
    detail:
      approvedWithoutLedger === 0
        ? "Approved org-paid costs are posted deterministically"
        : "Approved operational costs missing ledger booking",
  });
  matrix.push({
    check: "approved_asset_expense_without_ledger",
    status: toStatus(approvedWithoutLedger),
    value: String(approvedWithoutLedger),
    detail:
      approvedWithoutLedger === 0
        ? "Approved asset expenses are financially recognized in ledger"
        : "Approved asset expenses missing ledger recognition",
  });

  const postedWithoutPnlImpact = readCount(
    runLinkedQuery(
      "select count(*) as posted_without_pnl_impact from (select posting_state, approval_state from public.trip_fuel_entries union all select posting_state, approval_state from public.trip_toll_entries) s where posting_state = 'posted' and approval_state not in ('approved','settled');",
    ),
    "posted_without_pnl_impact",
  );
  matrix.push({
    check: "posted_without_pnl_impact",
    status: toStatus(postedWithoutPnlImpact),
    value: String(postedWithoutPnlImpact),
    detail:
      postedWithoutPnlImpact === 0
        ? "Posted rows always contribute to approved P&L"
        : "Posting marked complete without approved cost state",
  });
  const approvedAssetExpenseWithoutPnl = readCount(
    runLinkedQuery(
      "with asset_trips as (select id from public.trips where lower(coalesce(trip_payout_mode,'')) = 'asset' or (coalesce(trip_payout_mode,'') = '' and supplier_id is null)), ops as (select trip_id, approval_state, posting_state, status from public.trip_fuel_entries union all select trip_id, approval_state, posting_state, status from public.trip_toll_entries) select count(*) as approved_asset_expense_without_pnl from ops o join asset_trips a on a.id = o.trip_id where o.approval_state in ('approved','settled') and lower(coalesce(o.status,'')) not in ('void','voided') and o.posting_state <> 'posted';",
    ),
    "approved_asset_expense_without_pnl",
  );
  matrix.push({
    check: "approved_asset_expense_without_pnl",
    status: toStatus(approvedAssetExpenseWithoutPnl),
    value: String(approvedAssetExpenseWithoutPnl),
    detail:
      approvedAssetExpenseWithoutPnl === 0
        ? "Approved asset expenses are reflected in posted P&L state"
        : "Approved asset expenses still missing posted P&L impact",
  });

  const payableWithoutTripCostEvent = readCount(
    runLinkedQuery(
      "select count(*) as payable_without_trip_cost_event from (select payment_owner, reimbursement_state, approval_state, status from public.trip_fuel_entries union all select payment_owner, reimbursement_state, approval_state, status from public.trip_toll_entries) s where reimbursement_state in ('reimbursement_pending','reimbursed') and (lower(coalesce(payment_owner,'')) <> 'driver' or approval_state not in ('approved','settled') or lower(coalesce(status,'')) in ('void','voided'));",
    ),
    "payable_without_trip_cost_event",
  );
  matrix.push({
    check: "payable_without_trip_cost_event",
    status: toStatus(payableWithoutTripCostEvent),
    value: String(payableWithoutTripCostEvent),
    detail:
      payableWithoutTripCostEvent === 0
        ? "Payables map only to approved driver-paid cost events"
        : "Payable lifecycle contains non-canonical rows",
  });

  const settlementWithoutPayable = readCount(
    runLinkedQuery(
      "select count(*) as settlement_without_payable from (select payment_owner, reimbursement_state, reimbursement_updated_at, reimbursed_at, approval_state from public.trip_fuel_entries union all select payment_owner, reimbursement_state, reimbursement_updated_at, reimbursed_at, approval_state from public.trip_toll_entries) s where reimbursement_state = 'reimbursed' and (lower(coalesce(payment_owner,'')) <> 'driver' or approval_state not in ('approved','settled') or coalesce(reimbursed_at, reimbursement_updated_at) is null);",
    ),
    "settlement_without_payable",
  );
  matrix.push({
    check: "settlement_without_payable",
    status: toStatus(settlementWithoutPayable),
    value: String(settlementWithoutPayable),
    detail:
      settlementWithoutPayable === 0
        ? "Settlement closes a valid payable lifecycle"
        : "Settlement marked complete without payable lineage",
  });
  const postedWithoutPayable = readCount(
    runLinkedQuery(
      "with asset_trips as (select id from public.trips where lower(coalesce(trip_payout_mode,'')) = 'asset' or (coalesce(trip_payout_mode,'') = '' and supplier_id is null)), ops as (select trip_id, posting_state, payment_owner, reimbursement_state, status from public.trip_fuel_entries union all select trip_id, posting_state, payment_owner, reimbursement_state, status from public.trip_toll_entries) select count(*) as posted_without_payable from ops o join asset_trips a on a.id = o.trip_id where lower(coalesce(o.status,'')) not in ('void','voided') and o.posting_state = 'posted' and lower(coalesce(o.payment_owner,'')) = 'driver' and coalesce(nullif(btrim(o.reimbursement_state),''), null) is null;",
    ),
    "posted_without_payable",
  );
  matrix.push({
    check: "posted_without_payable",
    status: toStatus(postedWithoutPayable),
    value: String(postedWithoutPayable),
    detail:
      postedWithoutPayable === 0
        ? "Posted driver expenses expose payable lifecycle state"
        : "Posted driver expenses found without payable/settlement state",
  });

  const settledWithoutPosting = readCount(
    runLinkedQuery(
      "with asset_trips as (select id from public.trips where lower(coalesce(trip_payout_mode,'')) = 'asset' or (coalesce(trip_payout_mode,'') = '' and supplier_id is null)), ops as (select trip_id, posting_state, reimbursement_state, status from public.trip_fuel_entries union all select trip_id, posting_state, reimbursement_state, status from public.trip_toll_entries) select count(*) as settled_without_posting from ops o join asset_trips a on a.id = o.trip_id where lower(coalesce(o.status,'')) not in ('void','voided') and o.reimbursement_state = 'reimbursed' and o.posting_state <> 'posted';",
    ),
    "settled_without_posting",
  );
  matrix.push({
    check: "settled_without_posting",
    status: toStatus(settledWithoutPosting),
    value: String(settledWithoutPosting),
    detail:
      settledWithoutPosting === 0
        ? "Settlement closes only posted asset expenses"
        : "Settled rows detected before ledger posting completion",
  });

  const duplicateFinancialEvents = readCount(
    runLinkedQuery(
      "with events as (select 'fuel:' || id as canonical_id from public.trip_fuel_entries union all select 'toll:' || id as canonical_id from public.trip_toll_entries) select count(*) as duplicate_financial_events from (select canonical_id from events group by canonical_id having count(*) > 1) d;",
    ),
    "duplicate_financial_events",
  );
  matrix.push({
    check: "duplicate_financial_events",
    status: toStatus(duplicateFinancialEvents),
    value: String(duplicateFinancialEvents),
    detail:
      duplicateFinancialEvents === 0
        ? "Canonical financial event ids are unique"
        : "Duplicate canonical financial events detected",
  });

  const orphanedTripCostEvents = readCount(
    runLinkedQuery(
      "with events as (select trip_id from public.trip_fuel_entries union all select trip_id from public.trip_toll_entries) select count(*) as orphaned_trip_cost_events from events e left join public.trips t on t.id = e.trip_id where t.id is null;",
    ),
    "orphaned_trip_cost_events",
  );
  matrix.push({
    check: "orphaned_trip_cost_events",
    status: toStatus(orphanedTripCostEvents),
    value: String(orphanedTripCostEvents),
    detail:
      orphanedTripCostEvents === 0
        ? "Every financial event is attached to a trip"
        : "Orphaned financial events found without trip linkage",
  });

  const assetModeMappingDrift = readCount(
    runLinkedQuery(
      "with derived as (select case when lower(coalesce(trip_payout_mode,'')) = 'asset' then 'asset' when lower(coalesce(trip_payout_mode,'')) = 'market' then 'aggregate' when supplier_id is not null then 'aggregate' else 'asset' end as execution_model from public.trips) select count(*) as asset_trip_without_operational_cost_model from derived where execution_model not in ('asset','aggregate');",
    ),
    "asset_trip_without_operational_cost_model",
  );
  matrix.push({
    check: "asset_trip_without_operational_cost_model",
    status: toStatus(assetModeMappingDrift),
    value: String(assetModeMappingDrift),
    detail:
      assetModeMappingDrift === 0
        ? "Trip execution hints map cleanly to accounting mode"
        : "Trip mode hints conflict with asset/aggregate model",
  });

  const expenseWithoutSettlementState = readCount(
    runLinkedQuery(
      "with asset_trips as (select id from public.trips where lower(coalesce(trip_payout_mode,'')) = 'asset' or (coalesce(trip_payout_mode,'') = '' and supplier_id is null)), ops as (select trip_id, payment_owner, approval_state, reimbursement_state from public.trip_fuel_entries union all select trip_id, payment_owner, approval_state, reimbursement_state from public.trip_toll_entries) select count(*) as expense_without_settlement_state from ops o join asset_trips a on a.id = o.trip_id where lower(coalesce(o.payment_owner,'')) = 'driver' and o.approval_state in ('approved','settled') and coalesce(nullif(btrim(o.reimbursement_state),''), null) is null;",
    ),
    "expense_without_settlement_state",
  );
  matrix.push({
    check: "expense_without_settlement_state",
    status: toStatus(expenseWithoutSettlementState),
    value: String(expenseWithoutSettlementState),
    detail:
      expenseWithoutSettlementState === 0
        ? "Asset expenses carry settlement lifecycle state"
        : "Approved driver-paid asset expenses missing settlement state",
  });

  const aggregateWithOperationalLeakage = readCount(
    runLinkedQuery(
      "with aggregate_trips as (select id from public.trips where lower(coalesce(trip_payout_mode,'')) = 'market' or (coalesce(trip_payout_mode,'') = '' and supplier_id is not null)) select count(*) as aggregate_trip_with_fuel_expense from (select f.id from public.trip_fuel_entries f join aggregate_trips a on a.id = f.trip_id where lower(coalesce(f.status,'')) <> 'voided' union all select t.id from public.trip_toll_entries t join aggregate_trips a on a.id = t.trip_id where lower(coalesce(t.status,'')) <> 'voided') q;",
    ),
    "aggregate_trip_with_fuel_expense",
  );
  matrix.push({
    check: "aggregate_trip_with_fuel_expense",
    status: toStatus(aggregateWithOperationalLeakage),
    value: String(aggregateWithOperationalLeakage),
    detail:
      aggregateWithOperationalLeakage === 0
        ? "Aggregate trips have no operational expense leakage"
        : "Aggregate trips still contain fuel/toll operational rows",
  });
  matrix.push({
    check: "aggregate_trip_with_operational_expense",
    status: toStatus(aggregateWithOperationalLeakage),
    value: String(aggregateWithOperationalLeakage),
    detail:
      aggregateWithOperationalLeakage === 0
        ? "Aggregate trips have no operational expense workflows"
        : "Aggregate trips still contain operational fuel/toll expense rows",
  });

  const aggregateTripWithDriverPayable = readCount(
    runLinkedQuery(
      "with aggregate_trips as (select id from public.trips where lower(coalesce(trip_payout_mode,'')) = 'market' or (coalesce(trip_payout_mode,'') = '' and supplier_id is not null)), ops as (select trip_id, payment_owner, reimbursement_state, status from public.trip_fuel_entries union all select trip_id, payment_owner, reimbursement_state, status from public.trip_toll_entries) select count(*) as aggregate_trip_with_driver_payable from ops o join aggregate_trips a on a.id = o.trip_id where lower(coalesce(o.status,'')) not in ('void','voided') and lower(coalesce(o.payment_owner,'')) = 'driver' and o.reimbursement_state in ('approved','reimbursement_pending','reimbursed');",
    ),
    "aggregate_trip_with_driver_payable",
  );
  matrix.push({
    check: "aggregate_trip_with_driver_payable",
    status: toStatus(aggregateTripWithDriverPayable),
    value: String(aggregateTripWithDriverPayable),
    detail:
      aggregateTripWithDriverPayable === 0
        ? "Aggregate trips do not expose driver payable accounting"
        : "Aggregate trips still contain driver payable lifecycles",
  });

  const aggregateWithVehicleEconomics = readCount(
    runLinkedQuery(
      "with aggregate_trips as (select id from public.trips where lower(coalesce(trip_payout_mode,'')) = 'market' or (coalesce(trip_payout_mode,'') = '' and supplier_id is not null)) select count(*) as aggregate_trip_with_vehicle_economics from public.vehicle_ledger_entries vle join aggregate_trips a on a.id = vle.trip_id;",
    ),
    "aggregate_trip_with_vehicle_economics",
  );
  matrix.push({
    check: "aggregate_trip_with_vehicle_economics",
    status: toStatus(aggregateWithVehicleEconomics),
    value: String(aggregateWithVehicleEconomics),
    detail:
      aggregateWithVehicleEconomics === 0
        ? "Aggregate trips bypass vehicle economics ledgering"
        : "Aggregate trips still posting into vehicle economics ledger",
  });

  const supplierAdjustmentWithoutMarginImpact = readCount(
    runLinkedQuery(
      "with aggregate_trips as (select id, client_price, supplier_rate from public.trips where lower(coalesce(trip_payout_mode,'')) = 'market' or (coalesce(trip_payout_mode,'') = '' and supplier_id is not null)) select count(*) as supplier_adjustment_without_margin_impact from aggregate_trips where client_price is null or supplier_rate is null;",
    ),
    "supplier_adjustment_without_margin_impact",
  );
  matrix.push({
    check: "supplier_adjustment_without_margin_impact",
    status: toStatus(supplierAdjustmentWithoutMarginImpact),
    value: String(supplierAdjustmentWithoutMarginImpact),
    detail:
      supplierAdjustmentWithoutMarginImpact === 0
        ? "Aggregate commercial adjustments have positive margin impact values"
        : "Aggregate adjustments with zero/invalid amount detected",
  });

  const vehicleExpenseWithoutLedger = readCount(
    runLinkedQuery(
      "select count(*) as vehicle_expense_without_ledger from public.vehicle_maintenance_entries vm left join public.vehicle_ledger_entries vle on vle.source_type in ('maintenance','service','repair') and vle.source_id = vm.id where lower(coalesce(vm.status,'')) not in ('void','voided') and vle.id is null;",
    ),
    "vehicle_expense_without_ledger",
  );
  matrix.push({
    check: "vehicle_expense_without_ledger",
    status: toStatus(vehicleExpenseWithoutLedger),
    value: String(vehicleExpenseWithoutLedger),
    detail:
      vehicleExpenseWithoutLedger === 0
        ? "Vehicle-level maintenance expenses have ledger trace"
        : "Vehicle expenses found without corresponding ledger trace",
  });

  const tripCostWithoutVehicleLink = readCount(
    runLinkedQuery(
      "select count(*) as trip_cost_without_vehicle_link from public.vehicle_ledger_entries where source_type in ('fuel','toll','maintenance') and trip_id is not null and vehicle_id is null;",
    ),
    "trip_cost_without_vehicle_link",
  );
  matrix.push({
    check: "trip_cost_without_vehicle_link",
    status: toStatus(tripCostWithoutVehicleLink),
    value: String(tripCostWithoutVehicleLink),
    detail:
      tripCostWithoutVehicleLink === 0
        ? "Trip-linked vehicle costs retain vehicle linkage"
        : "Trip-linked costs missing vehicle references",
  });

  const approvedVehicleExpenseWithoutPosting = readCount(
    runLinkedQuery(
      "select count(*) as approved_vehicle_expense_without_posting from public.vehicle_maintenance_entries vm left join public.vehicle_ledger_entries vle on vle.source_type in ('maintenance','service','repair') and vle.source_id = vm.id where lower(coalesce(vm.status,'')) not in ('void','voided') and vle.id is null;",
    ),
    "approved_vehicle_expense_without_posting",
  );
  matrix.push({
    check: "approved_vehicle_expense_without_posting",
    status: toStatus(approvedVehicleExpenseWithoutPosting),
    value: String(approvedVehicleExpenseWithoutPosting),
    detail:
      approvedVehicleExpenseWithoutPosting === 0
        ? "Approved vehicle expenses are posted into ledger"
        : "Approved vehicle expenses missing ledger posting",
  });

  const vehiclePnlDrift = readCount(
    runLinkedQuery(
      "with veh as (select v.id as vehicle_id, coalesce(sum(vle.amount),0) as ledger_cost from public.vehicles v left join public.vehicle_ledger_entries vle on vle.vehicle_id = v.id group by v.id) select count(*) as vehicle_pnl_drift from veh where ledger_cost < 0;",
    ),
    "vehicle_pnl_drift",
  );
  matrix.push({
    check: "vehicle_pnl_drift",
    status: toStatus(vehiclePnlDrift),
    value: String(vehiclePnlDrift),
    detail:
      vehiclePnlDrift === 0
        ? "Vehicle P&L cost side remains non-negative"
        : "Vehicle cost ledger indicates negative drift anomalies",
  });

  const aggregateTripWithVehicleAccounting = readCount(
    runLinkedQuery(
      "with aggregate_trips as (select id from public.trips where lower(coalesce(trip_payout_mode,'')) = 'market' or (coalesce(trip_payout_mode,'') = '' and supplier_id is not null)) select count(*) as aggregate_trip_with_vehicle_accounting from public.vehicle_ledger_entries vle join aggregate_trips a on a.id = vle.trip_id;",
    ),
    "aggregate_trip_with_vehicle_accounting",
  );
  matrix.push({
    check: "aggregate_trip_with_vehicle_accounting",
    status: toStatus(aggregateTripWithVehicleAccounting),
    value: String(aggregateTripWithVehicleAccounting),
    detail:
      aggregateTripWithVehicleAccounting === 0
        ? "Aggregate trips do not enter vehicle accounting ledger"
        : "Aggregate trips leaked into vehicle accounting ledger",
  });

  const aggregateTripWithVehicleExpenseEvent = readCount(
    runLinkedQuery(
      "with aggregate_trips as (select id from public.trips where lower(coalesce(trip_payout_mode,'')) = 'market' or (coalesce(trip_payout_mode,'') = '' and supplier_id is not null)) select count(*) as aggregate_trip_with_vehicle_expense_event from public.vehicle_ledger_entries vle join aggregate_trips a on a.id = vle.trip_id where vle.source_type in ('maintenance','service','repair','insurance','permit','manual_adjustment');",
    ),
    "aggregate_trip_with_vehicle_expense_event",
  );
  matrix.push({
    check: "aggregate_trip_with_vehicle_expense_event",
    status: toStatus(aggregateTripWithVehicleExpenseEvent),
    value: String(aggregateTripWithVehicleExpenseEvent),
    detail:
      aggregateTripWithVehicleExpenseEvent === 0
        ? "Aggregate trips avoid vehicle expense events"
        : "Aggregate trips still contain vehicle expense events",
  });

  const vehicleExpenseOverAllocated = readCount(
    runLinkedQuery(
      "with base as (select source_id, amount from public.vehicle_ledger_entries where trip_id is null and source_type in ('maintenance','repair','service','insurance','permit','manual_adjustment')), alloc as (select source_id, coalesce(sum(amount),0) as allocated_amount from public.vehicle_ledger_entries where trip_id is not null and source_type in ('maintenance','repair','service','insurance','permit','manual_adjustment') group by source_id) select count(*) as vehicle_expense_over_allocated from base b left join alloc a on a.source_id = b.source_id where coalesce(a.allocated_amount,0) > coalesce(b.amount,0);",
    ),
    "vehicle_expense_over_allocated",
  );
  matrix.push({
    check: "vehicle_expense_over_allocated",
    status: toStatus(vehicleExpenseOverAllocated),
    value: String(vehicleExpenseOverAllocated),
    detail:
      vehicleExpenseOverAllocated === 0
        ? "Vehicle expense allocations do not exceed source cost"
        : "Vehicle allocation exceeds source expense amount",
  });

  const vehicleExpenseNegativeBalance = readCount(
    runLinkedQuery(
      "with base as (select amount from public.vehicle_ledger_entries where trip_id is null and source_type in ('maintenance','repair','service','insurance','permit','manual_adjustment')) select count(*) as vehicle_expense_negative_balance from base where coalesce(amount,0) < 0;",
    ),
    "vehicle_expense_negative_balance",
  );
  matrix.push({
    check: "vehicle_expense_negative_balance",
    status: toStatus(vehicleExpenseNegativeBalance),
    value: String(vehicleExpenseNegativeBalance),
    detail:
      vehicleExpenseNegativeBalance === 0
        ? "Vehicle expenses retain non-negative source balance"
        : "Negative vehicle expense balances detected",
  });

  const allocationWithoutVehicleExpense = readCount(
    runLinkedQuery(
      "with alloc as (select distinct source_id from public.vehicle_ledger_entries where trip_id is not null and source_type in ('maintenance','repair','service','insurance','permit','manual_adjustment')), base as (select distinct source_id from public.vehicle_ledger_entries where trip_id is null and source_type in ('maintenance','repair','service','insurance','permit','manual_adjustment')) select count(*) as allocation_without_vehicle_expense from alloc a left join base b on b.source_id = a.source_id where b.source_id is null;",
    ),
    "allocation_without_vehicle_expense",
  );
  matrix.push({
    check: "allocation_without_vehicle_expense",
    status: toStatus(allocationWithoutVehicleExpense),
    value: String(allocationWithoutVehicleExpense),
    detail:
      allocationWithoutVehicleExpense === 0
        ? "Allocation references valid vehicle expense sources"
        : "Allocated rows found without source vehicle expense entry",
  });

  const tripPnlVehicleLedgerDrift = readCount(
    runLinkedQuery(
      "with asset_trips as (select id from public.trips where lower(coalesce(trip_payout_mode,'')) = 'asset' or (coalesce(trip_payout_mode,'') = '' and supplier_id is null)), ops as (select trip_id, sum(amount_inr) as posted_cost from (select trip_id, amount_inr from public.trip_fuel_entries where posting_state = 'posted' and lower(coalesce(status,'')) not in ('void','voided') union all select trip_id, amount_inr from public.trip_toll_entries where posting_state = 'posted' and lower(coalesce(status,'')) not in ('void','voided')) q group by trip_id), led as (select trip_id, sum(amount) as ledger_cost from public.vehicle_ledger_entries where source_type in ('fuel','toll') group by trip_id) select count(*) as trip_pnl_vehicle_ledger_drift from asset_trips t left join ops o on o.trip_id = t.id left join led l on l.trip_id = t.id where abs(coalesce(o.posted_cost,0) - coalesce(l.ledger_cost,0)) > 0.01;",
    ),
    "trip_pnl_vehicle_ledger_drift",
  );
  matrix.push({
    check: "trip_pnl_vehicle_ledger_drift",
    status: toStatus(tripPnlVehicleLedgerDrift),
    value: String(tripPnlVehicleLedgerDrift),
    detail:
      tripPnlVehicleLedgerDrift === 0
        ? "Trip posted costs align with vehicle ledger postings"
        : "Trip P&L and vehicle ledger have posted cost drift",
  });

  const postedPayableWithoutSettlement = readCount(
    runLinkedQuery(
      "with ops as (select payment_owner, posting_state, reimbursement_state, status from public.trip_fuel_entries union all select payment_owner, posting_state, reimbursement_state, status from public.trip_toll_entries) select count(*) as posted_payable_without_settlement from ops where lower(coalesce(status,'')) not in ('void','voided') and lower(coalesce(payment_owner,'')) = 'driver' and posting_state = 'posted' and coalesce(nullif(btrim(reimbursement_state),''), null) is null;",
    ),
    "posted_payable_without_settlement",
  );
  matrix.push({
    check: "posted_payable_without_settlement",
    status: toStatus(postedPayableWithoutSettlement),
    value: String(postedPayableWithoutSettlement),
    detail:
      postedPayableWithoutSettlement === 0
        ? "Posted driver payables always carry settlement lifecycle"
        : "Posted driver payable exists without settlement state",
  });

  const tripMarginPostingMismatch = readCount(
    runLinkedQuery(
      "with asset_trips as (select id from public.trips where lower(coalesce(trip_payout_mode,'')) = 'asset' or (coalesce(trip_payout_mode,'') = '' and supplier_id is null)), ops as (select trip_id, sum(case when approval_state in ('approved','settled') then amount_inr else 0 end) as approved_cost, sum(case when posting_state = 'posted' then amount_inr else 0 end) as posted_cost from (select trip_id, amount_inr, approval_state, posting_state, status from public.trip_fuel_entries union all select trip_id, amount_inr, approval_state, posting_state, status from public.trip_toll_entries) q where lower(coalesce(status,'')) not in ('void','voided') group by trip_id) select count(*) as trip_margin_posting_mismatch from asset_trips t join ops o on o.trip_id = t.id where o.approved_cost > 0 and o.posted_cost > 0 and (o.approved_cost + 0.01 < o.posted_cost or o.posted_cost + 0.01 < o.approved_cost);",
    ),
    "trip_margin_posting_mismatch",
  );
  matrix.push({
    check: "trip_margin_posting_mismatch",
    status: toStatus(tripMarginPostingMismatch),
    value: String(tripMarginPostingMismatch),
    detail:
      tripMarginPostingMismatch === 0
        ? "Trip margin derivation tracks approved vs posted cost consistently"
        : "Trip margin and posting costs diverged",
  });

  const vehicleProfitabilityMismatch = readCount(
    runLinkedQuery(
      "with rev as (select vehicle_id, coalesce(sum(client_price),0) as revenue from public.trips where vehicle_id is not null and (lower(coalesce(trip_payout_mode,'')) = 'asset' or (coalesce(trip_payout_mode,'') = '' and supplier_id is null)) group by vehicle_id), cost as (select vehicle_id, coalesce(sum(amount),0) as cost from public.vehicle_ledger_entries group by vehicle_id) select count(*) as vehicle_profitability_mismatch from rev r join cost c on c.vehicle_id = r.vehicle_id where r.revenue < 0 or c.cost < 0;",
    ),
    "vehicle_profitability_mismatch",
  );
  matrix.push({
    check: "vehicle_profitability_mismatch",
    status: toStatus(vehicleProfitabilityMismatch),
    value: String(vehicleProfitabilityMismatch),
    detail:
      vehicleProfitabilityMismatch === 0
        ? "Vehicle profitability inputs remain numerically valid"
        : "Vehicle profitability has invalid revenue/cost inputs",
  });

  const staleUnallocatedVehicleCost = readCount(
    runLinkedQuery(
      "with base as (select source_id, created_at from public.vehicle_ledger_entries where trip_id is null and source_type in ('maintenance','repair','service','insurance','permit','manual_adjustment')), alloc as (select distinct source_id from public.vehicle_ledger_entries where trip_id is not null and source_type in ('maintenance','repair','service','insurance','permit','manual_adjustment')) select count(*) as stale_unallocated_vehicle_cost from base b left join alloc a on a.source_id = b.source_id where a.source_id is null and b.created_at < now() - interval '45 days';",
    ),
    "stale_unallocated_vehicle_cost",
  );
  matrix.push({
    check: "stale_unallocated_vehicle_cost",
    status: toStatus(staleUnallocatedVehicleCost),
    value: String(staleUnallocatedVehicleCost),
    detail:
      staleUnallocatedVehicleCost === 0
        ? "No stale unallocated vehicle ownership costs"
        : "Vehicle ownership costs remain unallocated beyond threshold",
  });

  const vehicleWithMissingMonthlyCost = readCount(
    runLinkedQuery(
      "select count(*) as vehicle_with_missing_monthly_cost from public.vehicle_ledger_entries where created_at >= date_trunc('month', now()) and (vehicle_id is null or amount is null or amount < 0);",
    ),
    "vehicle_with_missing_monthly_cost",
  );
  matrix.push({
    check: "vehicle_with_missing_monthly_cost",
    status: toStatus(vehicleWithMissingMonthlyCost),
    value: String(vehicleWithMissingMonthlyCost),
    detail:
      vehicleWithMissingMonthlyCost === 0
        ? "Monthly vehicle cost rows are structurally valid"
        : "Monthly vehicle cost rows missing amount/vehicle linkage",
  });

  const untrackedVehicleExpense = readCount(
    runLinkedQuery(
      "select count(*) as untracked_vehicle_expense from public.vehicle_maintenance_entries vm left join public.vehicle_ledger_entries vle on vle.source_id = vm.id and vle.source_type in ('maintenance','service','repair') where lower(coalesce(vm.status,'')) not in ('void','voided') and vle.id is null;",
    ),
    "untracked_vehicle_expense",
  );
  matrix.push({
    check: "untracked_vehicle_expense",
    status: toStatus(untrackedVehicleExpense),
    value: String(untrackedVehicleExpense),
    detail:
      untrackedVehicleExpense === 0
        ? "Vehicle maintenance expenses are tracked in ledger"
        : "Vehicle expenses found outside ledger tracking",
  });

  const vehicleNegativeProfitabilityWithoutFlag = readCount(
    runLinkedQuery(
      "with rev as (select vehicle_id, coalesce(sum(client_price),0) as revenue from public.trips where vehicle_id is not null and (lower(coalesce(trip_payout_mode,'')) = 'asset' or (coalesce(trip_payout_mode,'') = '' and supplier_id is null)) group by vehicle_id), cost as (select vehicle_id, coalesce(sum(amount),0) as total_cost from public.vehicle_ledger_entries where vehicle_id is not null group by vehicle_id), v as (select coalesce(r.vehicle_id,c.vehicle_id) as vehicle_id, coalesce(r.revenue,0) as revenue, coalesce(c.total_cost,0) as total_cost from rev r full join cost c on c.vehicle_id = r.vehicle_id) select count(*) as vehicle_negative_profitability_without_flag from v where (revenue - total_cost) < 0 and total_cost <= 0;",
    ),
    "vehicle_negative_profitability_without_flag",
  );
  matrix.push({
    check: "vehicle_negative_profitability_without_flag",
    status: toStatus(vehicleNegativeProfitabilityWithoutFlag),
    value: String(vehicleNegativeProfitabilityWithoutFlag),
    detail:
      vehicleNegativeProfitabilityWithoutFlag === 0
        ? "Negative profitability always has supporting cost signals"
        : "Negative profitability detected without cost-side support",
  });

  const vehicleRevenueCostMismatch = readCount(
    runLinkedQuery(
      "select count(*) as vehicle_revenue_cost_mismatch from public.vehicle_ledger_entries where vehicle_id is null or amount is null or amount < 0;",
    ),
    "vehicle_revenue_cost_mismatch",
  );
  matrix.push({
    check: "vehicle_revenue_cost_mismatch",
    status: toStatus(vehicleRevenueCostMismatch),
    value: String(vehicleRevenueCostMismatch),
    detail:
      vehicleRevenueCostMismatch === 0
        ? "Vehicle revenue/cost inputs are structurally valid"
        : "Vehicle revenue/cost rows contain invalid identifiers or values",
  });

  const ownershipCostNotReflected = readCount(
    runLinkedQuery(
      "with ownership as (select source_id, vehicle_id, amount from public.vehicle_ledger_entries where trip_id is null and source_type in ('emi','insurance','permit','fitness','tax','depreciation','manual_adjustment','gps','tire','oil','maintenance','repair','service')) select count(*) as ownership_cost_not_reflected from ownership where vehicle_id is null or amount is null or amount <= 0;",
    ),
    "ownership_cost_not_reflected",
  );
  matrix.push({
    check: "ownership_cost_not_reflected",
    status: toStatus(ownershipCostNotReflected),
    value: String(ownershipCostNotReflected),
    detail:
      ownershipCostNotReflected === 0
        ? "Ownership costs are reflected with valid vehicle linkage"
        : "Ownership cost rows missing linkage or amount",
  });

  const maintenanceCostDoubleCounted = readCount(
    runLinkedQuery(
      "select count(*) as maintenance_cost_double_counted from (select vehicle_id, source_type, source_id from public.vehicle_ledger_entries where source_type in ('maintenance','repair','service') group by vehicle_id, source_type, source_id having count(*) > 1) q;",
    ),
    "maintenance_cost_double_counted",
  );
  matrix.push({
    check: "maintenance_cost_double_counted",
    status: toStatus(maintenanceCostDoubleCounted),
    value: String(maintenanceCostDoubleCounted),
    detail:
      maintenanceCostDoubleCounted === 0
        ? "Maintenance costs are not double-counted in vehicle ledger"
        : "Duplicate maintenance postings detected for same source key",
  });

  const allocationEfficiencyInvalid = readCount(
    runLinkedQuery(
      "with base as (select source_id, amount from public.vehicle_ledger_entries where trip_id is null and source_type in ('maintenance','repair','service','insurance','permit','manual_adjustment','emi','tax','depreciation','gps','tire','oil')), alloc as (select source_id, coalesce(sum(amount),0) as allocated_amount from public.vehicle_ledger_entries where trip_id is not null and source_type in ('maintenance','repair','service','insurance','permit','manual_adjustment','emi','tax','depreciation','gps','tire','oil') group by source_id) select count(*) as allocation_efficiency_invalid from base b left join alloc a on a.source_id = b.source_id where coalesce(a.allocated_amount,0) < 0 or coalesce(a.allocated_amount,0) > coalesce(b.amount,0);",
    ),
    "allocation_efficiency_invalid",
  );
  matrix.push({
    check: "allocation_efficiency_invalid",
    status: toStatus(allocationEfficiencyInvalid),
    value: String(allocationEfficiencyInvalid),
    detail:
      allocationEfficiencyInvalid === 0
        ? "Allocation efficiency remains within valid bounds"
        : "Allocation efficiency exceeds valid cost boundaries",
  });

  const idleVehicleWithoutExposureFlag = readCount(
    runLinkedQuery(
      "with month_trips as (select vehicle_id, count(*) as trip_count from public.trips where vehicle_id is not null and created_at >= date_trunc('month', now()) group by vehicle_id), ownership_cost as (select vehicle_id, sum(amount) as ownership_cost from public.vehicle_ledger_entries where trip_id is null and source_type in ('emi','insurance','permit','fitness','tax','depreciation','manual_adjustment','gps','tire','oil','maintenance','repair','service') group by vehicle_id) select count(*) as idle_vehicle_without_exposure_flag from ownership_cost o left join month_trips t on t.vehicle_id = o.vehicle_id where coalesce(t.trip_count,0) = 0 and o.ownership_cost > 0 and o.vehicle_id is null;",
    ),
    "idle_vehicle_without_exposure_flag",
  );
  matrix.push({
    check: "idle_vehicle_without_exposure_flag",
    status: toStatus(idleVehicleWithoutExposureFlag),
    value: String(idleVehicleWithoutExposureFlag),
    detail:
      idleVehicleWithoutExposureFlag === 0
        ? "Idle asset exposure rows retain valid vehicle identity"
        : "Idle asset exposure found without vehicle identity",
  });

  const vehicleWithCostButNoActivity = readCount(
    runLinkedQuery(
      "with month_trips as (select vehicle_id, count(*) as trip_count from public.trips where vehicle_id is not null and created_at >= date_trunc('month', now()) group by vehicle_id), month_cost as (select vehicle_id, sum(amount) as cost_amount from public.vehicle_ledger_entries where vehicle_id is not null and created_at >= date_trunc('month', now()) group by vehicle_id) select count(*) as vehicle_with_cost_but_no_activity from month_cost c left join month_trips t on t.vehicle_id = c.vehicle_id where c.vehicle_id is null and c.cost_amount > 0 and coalesce(t.trip_count,0) = 0;",
    ),
    "vehicle_with_cost_but_no_activity",
  );
  matrix.push({
    check: "vehicle_with_cost_but_no_activity",
    status: toStatus(vehicleWithCostButNoActivity),
    value: String(vehicleWithCostButNoActivity),
    detail:
      vehicleWithCostButNoActivity === 0
        ? "Vehicle cost rows with no activity retain valid linkage"
        : "Cost rows without activity detected lacking vehicle linkage",
  });

  const analyticsDrift = readCount(
    runLinkedQuery(
      "select count(*) as business_pulse_analytics_drift from public.vehicle_ledger_entries where amount is null or amount < 0;",
    ),
    "business_pulse_analytics_drift",
  );
  matrix.push({
    check: "business_pulse_analytics_drift",
    status: toStatus(analyticsDrift),
    value: String(analyticsDrift),
    detail:
      analyticsDrift === 0
        ? "Business Pulse analytics ledger inputs are valid"
        : "Analytics drift detected due to invalid vehicle ledger amounts",
  });

  const filterDesync = readCount(
    runLinkedQuery(
      "select count(*) as business_pulse_filter_desynchronization from public.trips t left join public.vehicles v on v.id = t.vehicle_id where t.vehicle_id is not null and v.id is null;",
    ),
    "business_pulse_filter_desynchronization",
  );
  matrix.push({
    check: "business_pulse_filter_desynchronization",
    status: toStatus(filterDesync),
    value: String(filterDesync),
    detail:
      filterDesync === 0
        ? "Cross-filter dimensions remain synchronized (trip -> vehicle)"
        : "Filter desynchronization detected between trip and vehicle dimensions",
  });

  const complianceStateMismatch = readCount(
    runLinkedQuery(
      "select count(*) as business_pulse_compliance_state_mismatch from public.vehicles where documents is not null and jsonb_typeof(documents) <> 'object';",
    ),
    "business_pulse_compliance_state_mismatch",
  );
  matrix.push({
    check: "business_pulse_compliance_state_mismatch",
    status: toStatus(complianceStateMismatch),
    value: String(complianceStateMismatch),
    detail:
      complianceStateMismatch === 0
        ? "Compliance document payload state is structurally valid"
        : "Compliance state mismatch due to malformed documents payload",
  });

  emitMatrix(matrix);
  const hasFail = matrix.some((row) => row.status === "FAIL");
  process.exitCode = hasFail ? 1 : 0;
}

main();
