/**
 * Client profile data tabs — contacts, warehouses, contracts, commercials, finance, vault, audit.
 */
import type { ClientManagementBundle } from "@/features/clients/types/clientManagement.types";
import {
  clientProfileStyles as cpStyles,
  hubStyles as styles,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { formatINR } from "@/lib/format";
import { Text, View } from "react-native";

type BundleProps = { bundle: ClientManagementBundle };

function Empty({ message }: { message: string }) {
  return (
    <View style={cpStyles.emptyState}>
      <Text style={cpStyles.emptyStateText}>{message}</Text>
    </View>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  if (rows.length === 0) return <Empty message="No records yet." />;
  return (
    <View style={cpStyles.dataTable}>
      <View style={cpStyles.dataTableHead}>
        {headers.map((h) => (
          <Text key={h} style={cpStyles.dataTableHeadCell}>{h}</Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={cpStyles.dataTableRow}>
          {row.map((cell, j) => (
            <Text key={j} style={cpStyles.dataTableCell} numberOfLines={2}>{cell}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function ClientProfileContactsPanel({ bundle }: BundleProps) {
  const rows = bundle.contacts.map((c) => [
    c.name,
    c.designation ?? "—",
    c.mobile ?? "—",
    c.email ?? "—",
    c.is_primary ? "Primary" : "—",
    [
      c.is_decision_maker && "Decision",
      c.is_operations && "Ops",
      c.is_finance && "Finance",
      c.is_dispatch && "Dispatch",
      c.is_billing && "Billing",
    ].filter(Boolean).join(", ") || "—",
  ]);
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Contact directory</Text>
      <DataTable
        headers={["Name", "Designation", "Mobile", "Email", "Primary", "Roles"]}
        rows={rows}
      />
    </View>
  );
}

export function ClientProfileWarehousesPanel({ bundle }: BundleProps) {
  const rows = bundle.warehouses.map((w) => [
    w.warehouse_code ?? w.name.slice(0, 6).toUpperCase(),
    w.name,
    [w.city, w.state].filter(Boolean).join(", ") || "—",
    w.local_gstin ?? "—",
    w.contact_name ?? w.manager_name ?? "—",
    w.dock_count != null ? String(w.dock_count) : "—",
  ]);
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Warehouse network</Text>
      <DataTable
        headers={["Code", "Name", "Location", "GSTIN", "Contact", "Docks"]}
        rows={rows}
      />
    </View>
  );
}

export function ClientProfileContractsPanel({ bundle }: BundleProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Contract agreements</Text>
      {bundle.agreements.length === 0 ? (
        <Empty message="No contracts yet. Create a contract to define commercial terms, detention, and penalty clauses." />
      ) : (
        bundle.agreements.map((a) => (
          <View key={a.id} style={[styles.card, { marginBottom: 12 }]}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>{a.contract_number}</Text>
              <View style={styles.subscribedPill}>
                <Text style={styles.subscribedPillText}>{a.status.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.sectionSub}>
              {a.commercial_model.replace(/_/g, " ")} · {a.effective_date ?? "—"} → {a.expiry_date ?? "—"}
            </Text>
            {a.general_terms ? (
              <View style={cpStyles.contractTermsBlock}>
                <Text style={cpStyles.contractTermsTitle}>General terms</Text>
                <Text style={cpStyles.contractTermsBody}>{a.general_terms}</Text>
              </View>
            ) : null}
            <View style={cpStyles.contractTermsBlock}>
              <Text style={cpStyles.contractTermsTitle}>Detention</Text>
              <Text style={cpStyles.contractTermsBody}>
                Loading free hrs: {a.detention_terms?.loading_free_hours ?? "—"} · Unloading free hrs:{" "}
                {a.detention_terms?.unloading_free_hours ?? "—"} · Hourly: ₹
                {a.detention_terms?.loading_hourly_charge ?? "—"}
              </Text>
            </View>
            <View style={cpStyles.contractTermsBlock}>
              <Text style={cpStyles.contractTermsTitle}>Penalties</Text>
              <Text style={cpStyles.contractTermsBody}>
                Vehicle delay: {a.penalty_clauses?.vehicle_delay ?? "—"} · POD delay:{" "}
                {a.penalty_clauses?.pod_delay ?? "—"} · Delivery delay:{" "}
                {a.penalty_clauses?.delivery_delay ?? "—"}
              </Text>
            </View>
            <View style={cpStyles.contractTermsBlock}>
              <Text style={cpStyles.contractTermsTitle}>Payment terms</Text>
              <Text style={cpStyles.contractTermsBody}>
                Credit days: {a.payment_terms?.credit_days ?? "—"} · Billing:{" "}
                {a.payment_terms?.billing_cycle ?? "—"} · Invoice:{" "}
                {a.payment_terms?.invoice_frequency ?? "—"}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

export function ClientProfileCommercialsPanel({ bundle }: BundleProps) {
  const rows = bundle.lane_rates.map((r) => [
    r.origin_label,
    r.destination_label,
    r.vehicle_type ?? "—",
    r.rate != null ? formatINR(r.rate) : "—",
    r.rate_type.replace(/_/g, " "),
    r.is_spot_rate ? "Spot" : "Contract",
    r.valid_from ?? "—",
  ]);
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Lane rates & commercials</Text>
      <DataTable
        headers={["Origin", "Destination", "Vehicle", "Rate", "Type", "Model", "From"]}
        rows={rows}
      />
    </View>
  );
}

export function ClientProfileFinancePanel({ bundle }: BundleProps) {
  const fp = bundle.finance_profile;
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Finance & credit</Text>
      {!fp ? (
        <Empty message="Finance profile not configured. Set credit limit, payment terms, and aging buckets." />
      ) : (
        <>
          <View style={styles.statsBar}>
            {[
              { value: formatINR(fp.opening_balance), label: "OPENING" },
              { value: fp.credit_limit != null ? formatINR(fp.credit_limit) : "—", label: "CREDIT LIMIT" },
              { value: String(fp.credit_days), label: "CREDIT DAYS" },
              { value: fp.dso_target_days != null ? String(fp.dso_target_days) : "—", label: "DSO TARGET" },
            ].map((s, idx, arr) => (
              <View key={s.label} style={[styles.statCell, idx === arr.length - 1 && styles.statCellLast]}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Aging</Text>
          <DataTable
            headers={["0–30 days", "31–60", "61–90", "90+"]}
            rows={[[
              formatINR(fp.aging_0_30),
              formatINR(fp.aging_31_60),
              formatINR(fp.aging_61_90),
              formatINR(fp.aging_90_plus),
            ]]}
          />
        </>
      )}
    </View>
  );
}

export function ClientProfileVaultPanel({ bundle }: BundleProps) {
  const rows = bundle.documents.map((d) => [
    d.folder,
    d.title,
    d.doc_type,
    `v${d.version_number}`,
    d.expiry_date ?? "—",
  ]);
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Document vault</Text>
      <DataTable headers={["Folder", "Title", "Type", "Version", "Expiry"]} rows={rows} />
    </View>
  );
}

export function ClientProfileAuditPanel({ bundle }: BundleProps) {
  const rows = bundle.audit_log.map((a) => [
    new Date(a.created_at).toLocaleString("en-IN"),
    a.entity_type,
    a.action,
    a.field_name ?? "—",
    a.old_value ?? "—",
    a.new_value ?? "—",
  ]);
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Audit log</Text>
      <DataTable
        headers={["When", "Entity", "Action", "Field", "Old", "New"]}
        rows={rows}
      />
    </View>
  );
}
