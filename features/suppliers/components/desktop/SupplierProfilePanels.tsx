/**
 * Supplier profile panels — all 10 tab content components.
 * Each panel receives the SupplierManagementBundle and renders its section.
 */
import { formatINR } from "@/lib/format";
import Theme from "@/constants/Theme";
import {
  METRONIC,
  hubStyles as styles,
  spStyles as _spStyles,
  supplierStyles,
} from "@/features/suppliers/components/desktop/supplierProfileHub.styles";

// Merge client profile atoms with supplier-specific extensions
const spStyles = { ..._spStyles, ...supplierStyles };
import type { SupplierManagementBundle } from "@/features/suppliers/types/supplierManagement.types";
import {
  SUPPLIER_KYC_DOC_LABELS,
  MANDATORY_SUPPLIER_KYC_TYPES,
  type SupplierKycDocType,
  type ComplianceDocument,
  type SupplierContract,
  type SupplierVehicle,
  type SupplierWarehouse,
  type TimelineEvent,
} from "@/features/suppliers/types/supplierManagement.types";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Award,
  BadgeCheck,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCheck,
  FileText,
  Flag,
  IndianRupee,
  MapPin,
  Phone,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Upload,
  User,
  Users,
  Wallet,
  Zap,
} from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

type BundleProps = { bundle: SupplierManagementBundle };

// ── Shared atoms ──────────────────────────────────────────────────────────────

function Empty({ message }: { message: string }) {
  return (
    <View style={spStyles.emptyState}>
      <Text style={spStyles.emptyStateText}>{message}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (rows.length === 0) return <Empty message="No records yet." />;
  return (
    <View style={spStyles.dataTable}>
      <View style={spStyles.dataTableHead}>
        {headers.map((h) => (
          <Text key={h} style={spStyles.dataTableHeadCell}>{h}</Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={[spStyles.dataTableRow, i % 2 === 1 && spStyles.dataTableRowAlt]}>
          {row.map((cell, j) => (
            <Text key={j} style={spStyles.dataTableCell} numberOfLines={2}>{cell}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function StatusBadge({ status }: { status: "pending" | "uploaded" | "verified" | "rejected" | string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    verified:  { bg: "#E8FFF3", text: "#50CD89" },
    pending:   { bg: "#FFF8DD", text: "#F6C000" },
    uploaded:  { bg: "#EEF6FF", text: "#3E97FF" },
    rejected:  { bg: "#FFF1F2", text: "#F1416C" },
  };
  const c = colors[status] ?? { bg: "#F1F1F4", text: METRONIC.subtle };
  return (
    <View style={[spStyles.kycDocStatus as object, { backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start" }]}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: c.text }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
}

function TrafficLight({ status }: { status: "green" | "amber" | "red" }) {
  const color = status === "green" ? "#50CD89" : status === "amber" ? "#F6C000" : "#F1416C";
  return (
    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={spStyles.infoRow}>
      <Text style={spStyles.infoLabel}>{label}</Text>
      <Text style={spStyles.infoValue}>{value}</Text>
    </View>
  );
}

// ── TAB 1: Overview ───────────────────────────────────────────────────────────

export function SupplierProfileOverviewPanel({ bundle }: BundleProps) {
  const { supplier, trips, transactions, performance } = bundle;
  const completed = trips.filter((t) =>
    ["completed", "done", "delivered"].includes(t.status ?? ""),
  );
  const totalPayable = transactions
    .filter((tx) => (tx.amount_out ?? 0) > (tx.amount_in ?? 0))
    .reduce((s, tx) => s + ((tx.amount_out ?? 0) - (tx.amount_in ?? 0)), 0);
  const totalPaid = transactions
    .filter((tx) => (tx.amount_in ?? 0) > 0)
    .reduce((s, tx) => s + (tx.amount_in ?? 0), 0);

  return (
    <View style={styles.panel}>
      <View style={spStyles.overviewGrid}>
        {/* Left: KPI cards */}
        <View style={spStyles.overviewLeft}>
          <View style={spStyles.kpiGrid}>
            {[
              { label: "Total trips", value: String(trips.length), icon: <Truck size={18} color={METRONIC.link} />, tone: "blue" },
              { label: "Completed", value: String(completed.length), icon: <CheckCircle2 size={18} color="#50CD89" />, tone: "green" },
              { label: "Payable", value: formatINR(totalPayable), icon: <IndianRupee size={18} color="#F6C000" />, tone: "warn" },
              { label: "Paid", value: formatINR(totalPaid), icon: <Wallet size={18} color="#50CD89" />, tone: "green" },
            ].map((k) => (
              <View key={k.label} style={spStyles.kpiCard}>
                <View style={spStyles.kpiIcon}>{k.icon}</View>
                <Text style={spStyles.kpiValue}>{k.value}</Text>
                <Text style={spStyles.kpiLabel}>{k.label}</Text>
              </View>
            ))}
          </View>

          <View style={[spStyles.dataCard, { marginTop: 16 }]}>
            <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Supplier details</Text>
            {[
              ["Company", supplier.company_name ?? supplier.name ?? "—"],
              ["Contact person", supplier.contact_person ?? "—"],
              ["Phone", supplier.phone ?? "—"],
              ["Email", supplier.email ?? "—"],
              ["GST Number", supplier.gst_number ?? "—"],
              ["Address", supplier.address ?? "—"],
              ["Type", supplier.supplier_type ?? "offline"],
              ["Verified", supplier.is_verified ? "Yes" : "No"],
            ].map(([l, v]) => <InfoRow key={l} label={l} value={v} />)}
          </View>
        </View>

        {/* Right: Performance */}
        <View style={spStyles.overviewRight}>
          {performance ? (
            <View style={spStyles.dataCard}>
              <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Performance scorecard</Text>
              <View style={spStyles.scorecardRing}>
                <Text style={spStyles.scorecardScore}>{performance.overall_score}</Text>
                <Text style={spStyles.scorecardGrade}>{performance.grade}</Text>
              </View>
              {[
                ["On-time pickup", `${performance.on_time_pickup_pct}%`],
                ["On-time delivery", `${performance.on_time_delivery_pct}%`],
                ["POD compliance", `${performance.pod_compliance_pct}%`],
                ["Trip acceptance", `${performance.trip_acceptance_pct}%`],
                ["Settlement compliance", `${performance.settlement_compliance_pct}%`],
              ].map(([l, v]) => <InfoRow key={l} label={l} value={v} />)}
            </View>
          ) : null}

          {bundle.contracts.length > 0 && (
            <View style={[spStyles.dataCard, { marginTop: 12 }]}>
              <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Active contracts</Text>
              {bundle.contracts.filter((c) => c.status === "active").map((c) => (
                <View key={c.id} style={spStyles.contractRow}>
                  <FileText size={14} color={METRONIC.link} strokeWidth={2} />
                  <Text style={spStyles.contractName} numberOfLines={1}>{c.contract_name}</Text>
                  <Text style={spStyles.contractExpiry}>{c.expiry_date ?? "No expiry"}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ── TAB 2: KYC ────────────────────────────────────────────────────────────────

export function SupplierProfileKycPanel({ bundle, onUploadDoc }: BundleProps & { onUploadDoc?: (type: SupplierKycDocType) => void }) {
  const { kyc_documents } = bundle;
  const total = MANDATORY_SUPPLIER_KYC_TYPES.length;
  const verified = kyc_documents.filter((d) => d.status === "verified").length;
  const score = total > 0 ? Math.round((verified / total) * 100) : 0;

  const docForType = (type: SupplierKycDocType) =>
    kyc_documents.filter((d) => d.doc_type === type).sort((a, b) => b.version_number - a.version_number)[0];

  return (
    <View style={styles.panel}>
      <View style={spStyles.kycScoreBanner}>
        <View style={spStyles.kycScoreRing}>
          <Text style={spStyles.kycScoreValue}>{score}%</Text>
        </View>
        <View style={spStyles.kycScoreMeta}>
          <Text style={styles.sectionTitle}>KYC completion</Text>
          <Text style={spStyles.kycScoreSub}>{verified} of {total} mandatory documents verified</Text>
          {score < 100 ? (
            <Text style={spStyles.kycMissingText}>
              {MANDATORY_SUPPLIER_KYC_TYPES.filter((t) => !docForType(t)?.status).length} documents missing
            </Text>
          ) : (
            <Text style={spStyles.kycCompleteText}>All mandatory documents on file</Text>
          )}
        </View>
      </View>

      <SectionTitle>Mandatory documents</SectionTitle>
      <View style={spStyles.kycDocGrid}>
        {MANDATORY_SUPPLIER_KYC_TYPES.map((type) => {
          const doc = docForType(type);
          const uploaded = Boolean(doc?.storage_path);
          return (
            <View key={type} style={spStyles.kycDocCard}>
              <View style={spStyles.kycDocCardHead}>
                <FileCheck size={18} color={Theme.primary} strokeWidth={2} />
                <Text style={spStyles.kycDocTitle}>{SUPPLIER_KYC_DOC_LABELS[type]}</Text>
                {doc?.status === "verified" ? (
                  <CheckCircle2 size={16} color="#50CD89" strokeWidth={2} />
                ) : uploaded ? (
                  <AlertCircle size={16} color="#F6C000" strokeWidth={2} />
                ) : null}
              </View>
              <StatusBadge status={doc?.status ?? "pending"} />
              {doc?.expiry_date ? <Text style={spStyles.kycDocExpiry}>Expires {doc.expiry_date}</Text> : null}
              {doc?.verified_by ? <Text style={spStyles.kycDocExpiry}>Verified by {doc.verified_by}</Text> : null}
              <Pressable style={spStyles.kycUploadBtn} onPress={() => onUploadDoc?.(type)}>
                <Upload size={13} color={Theme.textOnPrimary} strokeWidth={2} />
                <Text style={spStyles.kycUploadBtnText}>{uploaded ? "Replace" : "Upload"}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={[spStyles.kycDocGrid as object, { marginTop: 24 }]}>
        <SectionTitle>Aadhaar verification</SectionTitle>
        {(["aadhaar_front", "aadhaar_back"] as SupplierKycDocType[]).map((type) => {
          const doc = docForType(type);
          return (
            <View key={type} style={spStyles.kycDocCard}>
              <View style={spStyles.kycDocCardHead}>
                <User size={18} color={Theme.primary} strokeWidth={2} />
                <Text style={spStyles.kycDocTitle}>{SUPPLIER_KYC_DOC_LABELS[type]}</Text>
              </View>
              <StatusBadge status={doc?.status ?? "pending"} />
              <Pressable style={spStyles.kycUploadBtn} onPress={() => onUploadDoc?.(type)}>
                <Upload size={13} color={Theme.textOnPrimary} strokeWidth={2} />
                <Text style={spStyles.kycUploadBtnText}>{doc ? "Replace" : "Upload"}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <SectionTitle>Verification log</SectionTitle>
      {kyc_documents.filter((d) => d.status === "verified").length === 0 ? (
        <Empty message="No verified documents yet." />
      ) : (
        <DataTable
          headers={["Document", "Status", "Verified by", "Date", "Remarks"]}
          rows={kyc_documents.filter((d) => d.status === "verified").map((d) => [
            SUPPLIER_KYC_DOC_LABELS[d.doc_type],
            d.status,
            d.verified_by ?? "—",
            d.verified_at?.slice(0, 10) ?? "—",
            d.remarks ?? "—",
          ])}
        />
      )}
    </View>
  );
}

// ── TAB 3: Compliance ─────────────────────────────────────────────────────────

export function SupplierProfileCompliancePanel({ bundle }: BundleProps) {
  const { compliance_docs } = bundle;

  const daysToLight = (days: number | null | undefined): "green" | "amber" | "red" => {
    if (!days) return "green";
    if (days > 60) return "green";
    if (days > 30) return "amber";
    return "red";
  };

  const ALERT_THRESHOLDS = [90, 60, 30, 15, 7, 1];

  const SAMPLE_DOCS: ComplianceDocument[] = [
    { id: "1", doc_type: "insurance", label: "Vehicle Insurance", expiry_date: null, status: "green", daysToExpiry: null },
    { id: "2", doc_type: "pollution", label: "PUC Certificate", expiry_date: null, status: "green", daysToExpiry: null },
    { id: "3", doc_type: "gst", label: "GST Registration", expiry_date: null, status: "green", daysToExpiry: null },
    { id: "4", doc_type: "labor_license", label: "Labour License", expiry_date: null, status: "amber", daysToExpiry: 45 },
  ];

  const docs = compliance_docs.length > 0 ? compliance_docs : SAMPLE_DOCS;
  const red = docs.filter((d) => d.status === "red").length;
  const amber = docs.filter((d) => d.status === "amber").length;
  const green = docs.filter((d) => d.status === "green").length;

  return (
    <View style={styles.panel}>
      {/* Health summary */}
      <View style={spStyles.complianceHealthRow}>
        {[
          { color: "#50CD89", label: "Compliant", count: green },
          { color: "#F6C000", label: "Expiring soon", count: amber },
          { color: "#F1416C", label: "Critical", count: red },
        ].map((s) => (
          <View key={s.label} style={spStyles.complianceHealthCard}>
            <View style={[spStyles.complianceHealthDot, { backgroundColor: s.color }]} />
            <Text style={spStyles.complianceHealthCount}>{s.count}</Text>
            <Text style={spStyles.complianceHealthLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <SectionTitle>Document tracker</SectionTitle>
      <View style={spStyles.dataTable}>
        <View style={spStyles.dataTableHead}>
          {["Document", "Status", "Expiry date", "Days remaining", "Action"].map((h) => (
            <Text key={h} style={spStyles.dataTableHeadCell}>{h}</Text>
          ))}
        </View>
        {docs.map((doc) => (
          <View key={doc.id} style={spStyles.dataTableRow}>
            <Text style={[spStyles.dataTableCell, { flex: 2 }]}>{doc.label}</Text>
            <View style={[spStyles.dataTableCell as object, { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }]}>
              <TrafficLight status={doc.status} />
              <Text style={spStyles.dataTableCell}>{doc.status}</Text>
            </View>
            <Text style={spStyles.dataTableCell}>{doc.expiry_date ?? "—"}</Text>
            <Text style={[spStyles.dataTableCell, doc.daysToExpiry != null && doc.daysToExpiry <= 30 && { color: "#F1416C", fontWeight: "700" }]}>
              {doc.daysToExpiry != null ? `${doc.daysToExpiry}d` : "—"}
            </Text>
            <Pressable style={spStyles.kycUploadBtn}>
              <Upload size={12} color="#fff" strokeWidth={2} />
              <Text style={spStyles.kycUploadBtnText}>Renew</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <SectionTitle>Alert configuration</SectionTitle>
      <View style={spStyles.alertConfigRow}>
        {ALERT_THRESHOLDS.map((days) => (
          <View key={days} style={spStyles.alertConfigChip}>
            <Bell size={12} color={METRONIC.link} strokeWidth={2} />
            <Text style={spStyles.alertConfigText}>{days}d</Text>
          </View>
        ))}
        <Text style={spStyles.alertConfigHint}>Automatic reminders before document expiry</Text>
      </View>
    </View>
  );
}

// ── TAB 4: Contracts ──────────────────────────────────────────────────────────

export function SupplierProfileContractsPanel({ bundle }: BundleProps) {
  const { contracts } = bundle;
  const active = contracts.filter((c) => c.status === "active");
  const expired = contracts.filter((c) => c.status === "expired");

  if (contracts.length === 0) {
    return (
      <View style={styles.panel}>
        <View style={spStyles.emptyActionCard}>
          <FileText size={36} color={METRONIC.muted} strokeWidth={1.5} />
          <Text style={spStyles.emptyActionTitle}>No contracts yet</Text>
          <Text style={spStyles.emptyActionSub}>Create a rate contract to manage lanes, SLA, and penalty terms.</Text>
          <Pressable style={spStyles.addBtn}>
            <Plus size={14} color="#fff" strokeWidth={2} />
            <Text style={spStyles.addBtnText}>Add contract</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={spStyles.contractsHeaderRow}>
        <Text style={styles.sectionTitle}>{active.length} active contract{active.length !== 1 ? "s" : ""}</Text>
        <Pressable style={spStyles.addBtn}>
          <Plus size={13} color="#fff" strokeWidth={2} />
          <Text style={spStyles.addBtnText}>Add contract</Text>
        </Pressable>
      </View>

      {active.map((contract) => (
        <View key={contract.id} style={spStyles.contractCard}>
          <View style={spStyles.contractCardHeader}>
            <View style={spStyles.contractCardLeft}>
              <Text style={spStyles.contractCardTitle}>{contract.contract_name}</Text>
              <Text style={spStyles.contractCardMeta}>
                {contract.effective_date} → {contract.expiry_date ?? "No expiry"} · {contract.mode.replace("_", " ").toUpperCase()}
              </Text>
            </View>
            <View style={[spStyles.contractStatusPill, { backgroundColor: "#E8FFF3" }]}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#50CD89" }}>ACTIVE</Text>
            </View>
          </View>

          {contract.lane_rates.length > 0 ? (
            <>
              <Text style={spStyles.contractSubTitle}>Rate matrix</Text>
              <DataTable
                headers={["Origin", "Destination", "Vehicle", "Rate (₹)", "Rate type"]}
                rows={contract.lane_rates.map((lr) => [
                  lr.origin, lr.destination, lr.vehicle_type,
                  formatINR(lr.rate), lr.rate_type.replace(/_/g, " "),
                ])}
              />
            </>
          ) : null}

          <Text style={spStyles.contractSubTitle}>SLA terms</Text>
          <View style={spStyles.slaBadgeRow}>
            {[
              `POD: ${contract.sla.pod_submission_days}d deadline`,
              `₹${contract.sla.pod_penalty_per_day}/day late`,
              `Detention: ${contract.sla.detention_free_hours}h free`,
              `₹${contract.sla.detention_rate_per_hour}/hr after`,
              `Placement grace: ${contract.sla.placement_delay_grace_hours}h`,
            ].map((s) => (
              <View key={s} style={spStyles.slaChip}>
                <Text style={spStyles.slaChipText}>{s}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      {expired.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Expired contracts ({expired.length})</Text>
          {expired.map((c) => (
            <View key={c.id} style={[spStyles.contractCard, { opacity: 0.6 }]}>
              <Text style={spStyles.contractCardTitle}>{c.contract_name}</Text>
              <Text style={spStyles.contractCardMeta}>Expired {c.expiry_date ?? "—"}</Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

// ── TAB 5: Fleet ──────────────────────────────────────────────────────────────

export function SupplierProfileFleetPanel({ bundle }: BundleProps) {
  const { fleet } = bundle;
  const active = fleet.filter((v) => v.status === "active").length;

  return (
    <View style={styles.panel}>
      <View style={spStyles.contractsHeaderRow}>
        <Text style={styles.sectionTitle}>{fleet.length} vehicles registered</Text>
        <Pressable style={spStyles.addBtn}>
          <Plus size={13} color="#fff" strokeWidth={2} />
          <Text style={spStyles.addBtnText}>Add vehicle</Text>
        </Pressable>
      </View>

      {fleet.length === 0 ? (
        <View style={spStyles.emptyActionCard}>
          <Truck size={36} color={METRONIC.muted} strokeWidth={1.5} />
          <Text style={spStyles.emptyActionTitle}>No vehicles registered</Text>
          <Text style={spStyles.emptyActionSub}>Track supplier fleet vehicles, compliance documents, and GPS status.</Text>
        </View>
      ) : (
        <DataTable
          headers={["Vehicle No", "Type", "Capacity", "Ownership", "Insurance", "Fitness", "GPS", "Status"]}
          rows={fleet.map((v) => [
            v.vehicle_number,
            v.vehicle_type,
            v.capacity_tons != null ? `${v.capacity_tons}T` : "—",
            v.ownership,
            v.insurance_expiry ?? "—",
            v.fitness_expiry ?? "—",
            v.gps_available ? "Yes" : "No",
            v.status,
          ])}
        />
      )}
    </View>
  );
}

// ── TAB 6: Drivers ────────────────────────────────────────────────────────────

export function SupplierProfileDriversPanel({ bundle }: BundleProps) {
  const { drivers } = bundle;

  return (
    <View style={styles.panel}>
      <View style={spStyles.contractsHeaderRow}>
        <Text style={styles.sectionTitle}>{drivers.length} drivers</Text>
        <Pressable style={spStyles.addBtn}>
          <Plus size={13} color="#fff" strokeWidth={2} />
          <Text style={spStyles.addBtnText}>Add driver</Text>
        </Pressable>
      </View>

      {drivers.length === 0 ? (
        <View style={spStyles.emptyActionCard}>
          <Users size={36} color={METRONIC.muted} strokeWidth={1.5} />
          <Text style={spStyles.emptyActionTitle}>No drivers on record</Text>
          <Text style={spStyles.emptyActionSub}>Track supplier drivers, licenses, experience, and trip history.</Text>
        </View>
      ) : (
        <DataTable
          headers={["Name", "Phone", "License", "Trips", "Rating", "Status"]}
          rows={drivers.map((d) => [
            d.name,
            d.phone ?? "—",
            (d as { license_number?: string | null }).license_number ?? "—",
            "—",
            "—",
            (d as { is_active?: boolean }).is_active !== false ? "Active" : "Inactive",
          ])}
        />
      )}
    </View>
  );
}

// ── TAB 7: Warehouses ─────────────────────────────────────────────────────────

export function SupplierProfileWarehousesPanel({ bundle }: BundleProps) {
  const { warehouses } = bundle;

  return (
    <View style={styles.panel}>
      <View style={spStyles.contractsHeaderRow}>
        <Text style={styles.sectionTitle}>{warehouses.length} warehouse{warehouses.length !== 1 ? "s" : ""}</Text>
        <Pressable style={spStyles.addBtn}>
          <Plus size={13} color="#fff" strokeWidth={2} />
          <Text style={spStyles.addBtnText}>Add warehouse</Text>
        </Pressable>
      </View>

      {warehouses.length === 0 ? (
        <View style={spStyles.emptyActionCard}>
          <Building2 size={36} color={METRONIC.muted} strokeWidth={1.5} />
          <Text style={spStyles.emptyActionTitle}>No warehouses registered</Text>
          <Text style={spStyles.emptyActionSub}>Register supplier warehouses with address, capacity, and compliance documents.</Text>
        </View>
      ) : (
        <View style={spStyles.warehouseGrid}>
          {warehouses.map((wh) => (
            <View key={wh.id} style={spStyles.warehouseCard}>
              <View style={spStyles.warehouseCardHead}>
                <Building2 size={20} color={METRONIC.link} strokeWidth={2} />
                <Text style={spStyles.warehouseCardName}>{wh.name}</Text>
                {wh.code ? <Text style={spStyles.warehouseCardCode}>{wh.code}</Text> : null}
              </View>
              {[
                ["Address", wh.address],
                ["City", [wh.city, wh.state, wh.pincode].filter(Boolean).join(", ") || "—"],
                ["Phone", wh.contact_number ?? "—"],
                ["Capacity", wh.storage_capacity_sqft != null ? `${wh.storage_capacity_sqft} sqft` : "—"],
                ["Loading bays", wh.loading_bays != null ? String(wh.loading_bays) : "—"],
                ["Working hours", wh.working_hours ?? "—"],
              ].map(([l, v]) => <InfoRow key={l} label={l} value={v} />)}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── TAB 8: Performance ────────────────────────────────────────────────────────

export function SupplierProfilePerformancePanel({ bundle }: BundleProps) {
  const { performance, trips } = bundle;

  if (!performance) {
    return (
      <View style={styles.panel}>
        <Empty message="No performance data available." />
      </View>
    );
  }

  const metrics: Array<{ label: string; value: string; icon: React.ReactNode; good: boolean }> = [
    { label: "On-time pickup", value: `${performance.on_time_pickup_pct}%`, icon: <Clock size={16} color={METRONIC.link} />, good: performance.on_time_pickup_pct >= 80 },
    { label: "On-time delivery", value: `${performance.on_time_delivery_pct}%`, icon: <CheckCircle2 size={16} color="#50CD89" />, good: performance.on_time_delivery_pct >= 80 },
    { label: "POD compliance", value: `${performance.pod_compliance_pct}%`, icon: <FileCheck size={16} color="#50CD89" />, good: performance.pod_compliance_pct >= 80 },
    { label: "Trip acceptance", value: `${performance.trip_acceptance_pct}%`, icon: <Zap size={16} color={METRONIC.link} />, good: performance.trip_acceptance_pct >= 90 },
    { label: "Cancellations", value: `${performance.cancellation_pct}%`, icon: <AlertTriangle size={16} color="#F6C000" />, good: performance.cancellation_pct < 5 },
    { label: "Claim rate", value: `${performance.claim_pct}%`, icon: <ShieldAlert size={16} color="#F1416C" />, good: performance.claim_pct < 2 },
    { label: "Damage rate", value: `${performance.damage_pct}%`, icon: <AlertCircle size={16} color="#F1416C" />, good: performance.damage_pct < 1 },
    { label: "Settlement compliance", value: `${performance.settlement_compliance_pct}%`, icon: <Wallet size={16} color="#50CD89" />, good: performance.settlement_compliance_pct >= 90 },
    { label: "Avg detention", value: `${performance.avg_detention_hours}h`, icon: <Activity size={16} color={METRONIC.muted} />, good: performance.avg_detention_hours < 4 },
    { label: "Avg rating", value: performance.avg_rating != null ? performance.avg_rating.toFixed(1) : "—", icon: <Award size={16} color="#F6C000" />, good: (performance.avg_rating ?? 0) >= 4 },
  ];

  const gradeColor =
    performance.grade === "A+" || performance.grade === "A" ? "#50CD89"
    : performance.grade === "B" ? "#3E97FF"
    : performance.grade === "C" ? "#F6C000"
    : "#F1416C";

  return (
    <View style={styles.panel}>
      {/* Overall score */}
      <View style={spStyles.performanceHeader}>
        <View style={[spStyles.scorecardRing, { borderColor: gradeColor }]}>
          <Text style={[spStyles.scorecardScore, { color: gradeColor }]}>{performance.overall_score}</Text>
          <Text style={[spStyles.scorecardGrade, { color: gradeColor }]}>{performance.grade}</Text>
        </View>
        <View style={spStyles.performanceHeaderMeta}>
          <Text style={styles.sectionTitle}>Overall supplier score</Text>
          <Text style={spStyles.kpiLabel}>Based on {performance.total_trips} trips · Weighted scorecard</Text>
          <View style={spStyles.heroTagRow}>
            {(["A+","A","B","C","D"] as const).map((g) => (
              <View key={g} style={[spStyles.gradeChip, performance.grade === g && { backgroundColor: gradeColor }]}>
                <Text style={[spStyles.gradeChipText, performance.grade === g && { color: "#fff" }]}>{g}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Metric grid */}
      <SectionTitle>Scorecard metrics</SectionTitle>
      <View style={spStyles.performanceGrid}>
        {metrics.map((m) => (
          <View key={m.label} style={spStyles.performanceMetricCard}>
            <View style={spStyles.performanceMetricIcon}>{m.icon}</View>
            <Text style={[spStyles.performanceMetricValue, !m.good && { color: "#F6C000" }]}>{m.value}</Text>
            <Text style={spStyles.performanceMetricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── TAB 9: Finance ────────────────────────────────────────────────────────────

export function SupplierProfileFinancePanel({ bundle }: BundleProps) {
  const { transactions, trips } = bundle;

  const totalOut = transactions.reduce((s, tx) => s + (tx.amount_out ?? 0), 0);
  const totalIn = transactions.reduce((s, tx) => s + (tx.amount_in ?? 0), 0);
  const balance = totalOut - totalIn;
  const tripRevenue = trips.reduce((s, t) => s + Number(t.supplier_rate ?? 0), 0);

  // Aging buckets
  const now = Date.now();
  const buckets = { b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0 };
  for (const tx of transactions) {
    const diff = Math.floor((now - new Date(tx.transaction_date ?? tx.created_at ?? "").getTime()) / 86400000);
    const amt = (tx.amount_out ?? 0) - (tx.amount_in ?? 0);
    if (amt <= 0) continue;
    if (diff <= 30) buckets.b0_30 += amt;
    else if (diff <= 60) buckets.b31_60 += amt;
    else if (diff <= 90) buckets.b61_90 += amt;
    else buckets.b90plus += amt;
  }

  return (
    <View style={styles.panel}>
      {/* Summary */}
      <View style={spStyles.financeKpiRow}>
        {[
          { label: "Total payable", value: formatINR(balance > 0 ? balance : 0), tone: balance > 0 ? "warn" : "green" },
          { label: "Total paid", value: formatINR(totalIn), tone: "green" },
          { label: "Total freight", value: formatINR(tripRevenue), tone: "blue" },
          { label: "Outstanding", value: formatINR(Math.max(0, tripRevenue - totalIn)), tone: "warn" },
        ].map((k) => (
          <View key={k.label} style={[spStyles.kpiCard, { flex: 1 }]}>
            <Text style={spStyles.kpiValue}>{k.value}</Text>
            <Text style={spStyles.kpiLabel}>{k.label}</Text>
          </View>
        ))}
      </View>

      {/* Aging */}
      <SectionTitle>Payable aging</SectionTitle>
      <View style={spStyles.agingRow}>
        {[
          { label: "0-30 days", value: formatINR(buckets.b0_30), color: "#50CD89" },
          { label: "31-60 days", value: formatINR(buckets.b31_60), color: "#F6C000" },
          { label: "61-90 days", value: formatINR(buckets.b61_90), color: "#FF9500" },
          { label: "90+ days", value: formatINR(buckets.b90plus), color: "#F1416C" },
        ].map((b) => (
          <View key={b.label} style={[spStyles.agingCard, { borderTopColor: b.color }]}>
            <Text style={[spStyles.agingValue, { color: b.color }]}>{b.value}</Text>
            <Text style={spStyles.agingLabel}>{b.label}</Text>
          </View>
        ))}
      </View>

      {/* Transaction ledger */}
      <SectionTitle>Ledger</SectionTitle>
      {transactions.length === 0 ? (
        <Empty message="No transactions recorded yet." />
      ) : (
        <DataTable
          headers={["Date", "Description", "Amount paid", "Amount received", "Balance"]}
          rows={(() => {
            let running = 0;
            return [...transactions]
              .sort((a, b) => (b.transaction_date ?? "").localeCompare(a.transaction_date ?? ""))
              .map((tx) => {
                running += (tx.amount_out ?? 0) - (tx.amount_in ?? 0);
                return [
                  (tx.transaction_date ?? tx.created_at ?? "").slice(0, 10),
                  tx.description ?? tx.party_name ?? "—",
                  tx.amount_out ? formatINR(tx.amount_out) : "—",
                  tx.amount_in ? formatINR(tx.amount_in) : "—",
                  formatINR(running),
                ];
              });
          })()}
        />
      )}
    </View>
  );
}

// ── TAB 10: Timeline ──────────────────────────────────────────────────────────

const TIMELINE_ICONS: Record<string, React.ReactNode> = {
  supplier_created:   <Zap size={14} color="#fff" strokeWidth={2.5} />,
  contract_uploaded:  <FileText size={14} color="#fff" strokeWidth={2} />,
  kyc_approved:       <ShieldCheck size={14} color="#fff" strokeWidth={2} />,
  vehicle_added:      <Truck size={14} color="#fff" strokeWidth={2} />,
  driver_added:       <User size={14} color="#fff" strokeWidth={2} />,
  trip_assigned:      <Briefcase size={14} color="#fff" strokeWidth={2} />,
  penalty_applied:    <AlertTriangle size={14} color="#fff" strokeWidth={2} />,
  penalty_waived:     <CheckCircle2 size={14} color="#fff" strokeWidth={2} />,
  payment_released:   <IndianRupee size={14} color="#fff" strokeWidth={2} />,
  document_expired:   <AlertCircle size={14} color="#fff" strokeWidth={2} />,
  status_changed:     <Flag size={14} color="#fff" strokeWidth={2} />,
};

const TIMELINE_COLORS: Record<string, string> = {
  supplier_created:  "#3E97FF",
  contract_uploaded: "#50CD89",
  kyc_approved:      "#50CD89",
  vehicle_added:     "#F6C000",
  driver_added:      "#F6C000",
  trip_assigned:     "#3E97FF",
  penalty_applied:   "#F1416C",
  penalty_waived:    "#50CD89",
  payment_released:  "#50CD89",
  document_expired:  "#F1416C",
  status_changed:    METRONIC.subtle,
};

export function SupplierProfileTimelinePanel({ bundle }: BundleProps) {
  const { timeline } = bundle;
  const events = [...timeline].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <View style={styles.panel}>
      <SectionTitle>Audit trail</SectionTitle>
      <Text style={spStyles.timelineNote}>All changes are immutable and permanently recorded.</Text>
      {events.length === 0 ? (
        <Empty message="No events recorded yet." />
      ) : (
        <View style={spStyles.timeline}>
          {events.map((event, idx) => {
            const color = TIMELINE_COLORS[event.event_type] ?? METRONIC.subtle;
            const icon = TIMELINE_ICONS[event.event_type] ?? <Zap size={14} color="#fff" strokeWidth={2} />;
            const isLast = idx === events.length - 1;
            return (
              <View key={event.id} style={spStyles.timelineItem}>
                <View style={spStyles.timelineLeft}>
                  <View style={[spStyles.timelineIconCircle, { backgroundColor: color }]}>{icon}</View>
                  {!isLast && <View style={spStyles.timelineLine} />}
                </View>
                <View style={spStyles.timelineContent}>
                  <Text style={spStyles.timelineTitle}>{event.description}</Text>
                  <View style={spStyles.timelineMeta}>
                    <Calendar size={11} color={METRONIC.muted} strokeWidth={2} />
                    <Text style={spStyles.timelineDate}>{event.created_at.slice(0, 10)}</Text>
                    {event.actor ? (
                      <>
                        <User size={11} color={METRONIC.muted} strokeWidth={2} />
                        <Text style={spStyles.timelineDate}>{event.actor}</Text>
                      </>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
