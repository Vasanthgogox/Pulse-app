/**
 * Network report export — PDF and Excel for Connection Sales, Asset Sales, and Connections.
 * Same pattern as pulseDrilldownExport.util.ts / pulseAgingExport.util.ts.
 */
// expo-file-system SDK 54 moved writeAsStringAsync/cacheDirectory to the legacy entry.
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { Platform, Share } from "react-native";
import { prependPulseExcelBanner } from "@/lib/reportWatermark.util";
import { buildPulseIntelligenceReportHtml } from "@/lib/pulseReportPrint.util";
import type { SalesTableRow, SalesKpis } from "@/features/network/utils/connectionSalesAnalytics.util";
import type {
  AssetVehicleTableRow,
  AssetDriverTableRow,
  AssetSalesKpis,
} from "@/features/network/utils/assetSalesAnalytics.util";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";

// ── helpers ──────────────────────────────────────────────────────────────────

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function stamp(): number {
  return Date.now();
}

function triggerWebDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

async function shareOrSave(
  workbook: XLSX.WorkBook,
  fileName: string,
  dialogTitle: string,
): Promise<void> {
  const ts = stamp();
  const file = `${fileName}-${ts}.xlsx`;
  if (Platform.OS === "web") {
    const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const blob = new Blob([arrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    triggerWebDownload(blob, file);
    return;
  }
  const cacheDir = (FileSystem as { cacheDirectory?: string }).cacheDirectory;
  if (!cacheDir) throw new Error("No cache directory");
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  const uri = `${cacheDir}${file}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: "base64" });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle,
      UTI: "org.openxmlformats.spreadsheetml.sheet",
    });
    return;
  }
  await Share.share({ url: uri, title: dialogTitle });
}

async function printOrShare(html: string, title: string, _fileName: string): Promise<void> {
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: title,
      UTI: "com.adobe.pdf",
    });
    return;
  }
  await Share.share({ url: uri, title });
}

// ── Connection Sales ──────────────────────────────────────────────────────────

export function buildConnectionSalesWorkbook(
  rows: SalesTableRow[],
  kpis: SalesKpis,
  companyName: string,
  dateRangeLabel: string,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summarySheet = prependPulseExcelBanner(
    [
      ["Pulse Network — Connection Sales Report"],
      ["Company", companyName],
      ["Period", dateRangeLabel],
      ["Generated", new Date().toLocaleDateString("en-IN")],
      [],
      ["KPI", "Value"],
      ["Total Trips", kpis.totalTrips],
      ["Total Sales", inr(kpis.totalSales)],
      ["Total Cost", inr(kpis.totalCost)],
      ["Net Margin", inr(kpis.totalMargin)],
      ["Active Partners", kpis.activePartners],
      ["Integrated %", pct(kpis.integratedPct)],
      ["Avg Rating", kpis.avgRating != null ? kpis.avgRating.toFixed(2) : "—"],
      ["Top Lane", kpis.topLane ?? "—"],
      ["Lanes Tracked", kpis.laneCount],
    ],
    "Summary",
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summarySheet), "Summary");

  // Sheet 2: Partner performance
  const header = [
    "Partner",
    "Role",
    "Trips",
    "Sales / Cost (₹)",
    "Margin (₹)",
    "Margin %",
    "Contribution %",
    "Top Lane",
    "Rating",
    "Last Active",
    "Status",
  ];
  const dataRows = rows.map((row) => [
    row.name,
    row.role,
    row.trips,
    inr(row.revenue),
    inr(row.margin),
    pct(row.avgMarginPct),
    pct(row.revenueContributionPct),
    row.topLane,
    row.rating != null ? row.rating.toFixed(1) : "—",
    row.lastTripLabel ?? "—",
    row.isIntegrated ? "Integrated" : "Network",
  ]);
  const partnerSheet = XLSX.utils.aoa_to_sheet([header, ...dataRows]);

  // Column widths
  partnerSheet["!cols"] = [
    { wch: 28 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 16 },
    { wch: 12 }, { wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, partnerSheet, "Partners");

  return wb;
}

function buildConnectionSalesPdfHtml(
  rows: SalesTableRow[],
  kpis: SalesKpis,
  companyName: string,
  dateRangeLabel: string,
): string {
  return buildPulseIntelligenceReportHtml({
    title: "Connection Sales Report",
    companyName,
    filterCaption: dateRangeLabel,
    summaryCards: [
      { label: "Total Trips", value: String(kpis.totalTrips) },
      { label: "Total Sales", value: inr(kpis.totalSales) },
      { label: "Net Margin", value: inr(kpis.totalMargin) },
      { label: "Active Partners", value: String(kpis.activePartners) },
      { label: "Avg Rating", value: kpis.avgRating != null ? kpis.avgRating.toFixed(2) : "—" },
      { label: "Integrated", value: pct(kpis.integratedPct) },
    ],
    columns: [
      { key: "name",    label: "Partner",    align: "left",  width: "22%" },
      { key: "role",    label: "Role",       align: "left",  width: "10%" },
      { key: "trips",   label: "Trips",      align: "right", width: "7%"  },
      { key: "revenue", label: "Sales/Cost", align: "right", width: "14%" },
      { key: "margin",  label: "Margin",     align: "right", width: "14%" },
      { key: "marginPct", label: "Margin %", align: "right", width: "10%" },
      { key: "lane",    label: "Top Lane",   align: "left",  width: "20%" },
      { key: "last",    label: "Last Active",align: "left",  width: "12%" },
      { key: "status",  label: "Status",     align: "center",width: "12%" },
    ],
    rows: rows.map((row) => ({
      name:     row.name,
      role:     row.role,
      trips:    String(row.trips),
      revenue:  inr(row.revenue),
      margin:   inr(row.margin),
      marginPct: pct(row.avgMarginPct),
      lane:     row.topLane,
      last:     row.lastTripLabel ?? "—",
      status:   row.isIntegrated ? "Integrated" : "Network",
    })),
    landscape: true,
  });
}

export async function exportConnectionSalesExcel(
  rows: SalesTableRow[],
  kpis: SalesKpis,
  companyName: string,
  dateRangeLabel: string,
): Promise<void> {
  const wb = buildConnectionSalesWorkbook(rows, kpis, companyName, dateRangeLabel);
  await shareOrSave(wb, "pulse-network-sales", "Connection Sales Report (Excel)");
}

export async function exportConnectionSalesPdf(
  rows: SalesTableRow[],
  kpis: SalesKpis,
  companyName: string,
  dateRangeLabel: string,
): Promise<void> {
  const html = buildConnectionSalesPdfHtml(rows, kpis, companyName, dateRangeLabel);
  await printOrShare(html, "Connection Sales Report", "pulse-network-sales");
}

// ── Asset Sales ───────────────────────────────────────────────────────────────

export function buildAssetVehiclesWorkbook(
  rows: AssetVehicleTableRow[],
  kpis: AssetSalesKpis,
  companyName: string,
  dateRangeLabel: string,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const summarySheet = prependPulseExcelBanner(
    [
      ["Pulse Network — Asset Fleet Report"],
      ["Company", companyName],
      ["Period", dateRangeLabel],
      ["Generated", new Date().toLocaleDateString("en-IN")],
      [],
      ["KPI", "Value"],
      ["Asset Trips", kpis.totalTrips],
      ["Active Vehicles", kpis.activeVehicles],
      ["Active Drivers", kpis.activeDrivers],
      ["Fleet Revenue", inr(kpis.totalRevenue)],
      ["Net Margin", inr(kpis.totalMargin)],
      ["On-Time %", pct(kpis.fleetOnTimePct)],
      ["Avg Utilization", pct(kpis.avgUtilizationPct)],
    ],
    "Summary",
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summarySheet), "Summary");

  const header = [
    "Vehicle", "Trips", "Revenue (₹)", "Margin (₹)", "Km Driven",
    "Revenue/Km", "Utilization %", "Performance Score", "Top Lane",
  ];
  const dataRows = rows.map((row) => [
    row.name,
    row.trips,
    inr(row.revenue),
    inr(row.margin),
    row.kmDriven,
    row.revenuePerKm.toFixed(1),
    pct(row.utilizationPct),
    row.performanceScore,
    row.topLane ?? "—",
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  sheet["!cols"] = [
    { wch: 18 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, sheet, "Vehicles");

  return wb;
}

export function buildAssetDriversWorkbook(
  rows: AssetDriverTableRow[],
  companyName: string,
  dateRangeLabel: string,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const header = [
    "Driver", "Trips", "Revenue (₹)", "Margin (₹)",
    "Earnings (₹)", "On-Time %", "Performance Score", "Top Lane",
  ];
  const dataRows = rows.map((row) => [
    row.name,
    row.trips,
    inr(row.revenue),
    inr(row.margin),
    inr(row.earnings),
    pct(row.onTimePct),
    row.performanceScore,
    row.topLane ?? "—",
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([
    [`Pulse — Driver Performance Report · ${companyName} · ${dateRangeLabel}`],
    [],
    header,
    ...dataRows,
  ]);
  sheet["!cols"] = [
    { wch: 24 }, { wch: 8 }, { wch: 16 }, { wch: 16 },
    { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, sheet, "Drivers");

  return wb;
}

export async function exportAssetVehiclesExcel(
  rows: AssetVehicleTableRow[],
  kpis: AssetSalesKpis,
  companyName: string,
  dateRangeLabel: string,
): Promise<void> {
  const wb = buildAssetVehiclesWorkbook(rows, kpis, companyName, dateRangeLabel);
  await shareOrSave(wb, "pulse-fleet-vehicles", "Fleet Vehicles Report (Excel)");
}

export async function exportAssetVehiclesPdf(
  rows: AssetVehicleTableRow[],
  kpis: AssetSalesKpis,
  companyName: string,
  dateRangeLabel: string,
): Promise<void> {
  const html = buildPulseIntelligenceReportHtml({
    title: "Asset Fleet Report",
    companyName,
    filterCaption: dateRangeLabel,
    summaryCards: [
      { label: "Asset Trips", value: String(kpis.totalTrips) },
      { label: "Active Vehicles", value: String(kpis.activeVehicles) },
      { label: "Fleet Revenue", value: inr(kpis.totalRevenue) },
      { label: "Net Margin", value: inr(kpis.totalMargin) },
      { label: "On-Time %", value: pct(kpis.fleetOnTimePct) },
    ],
    columns: [
      { key: "vehicle",   label: "Vehicle",       align: "left",  width: "16%" },
      { key: "trips",     label: "Trips",          align: "right", width: "7%"  },
      { key: "revenue",   label: "Revenue",        align: "right", width: "14%" },
      { key: "margin",    label: "Margin",         align: "right", width: "14%" },
      { key: "util",      label: "Utilization",    align: "right", width: "12%" },
      { key: "score",     label: "Score",          align: "right", width: "8%"  },
      { key: "lane",      label: "Top Lane",       align: "left",  width: "20%" },
    ],
    rows: rows.map((row) => ({
      vehicle: row.name,
      trips:   String(row.trips),
      revenue: inr(row.revenue),
      margin:  inr(row.margin),
      util:    pct(row.utilizationPct),
      score:   String(row.performanceScore),
      lane:    row.topLane ?? "—",
    })),
    landscape: true,
  });
  await printOrShare(html, "Fleet Vehicles Report", "pulse-fleet-vehicles");
}

export async function exportAssetDriversExcel(
  rows: AssetDriverTableRow[],
  companyName: string,
  dateRangeLabel: string,
): Promise<void> {
  const wb = buildAssetDriversWorkbook(rows, companyName, dateRangeLabel);
  await shareOrSave(wb, "pulse-fleet-drivers", "Fleet Drivers Report (Excel)");
}

export async function exportAssetDriversPdf(
  rows: AssetDriverTableRow[],
  companyName: string,
  dateRangeLabel: string,
): Promise<void> {
  const html = buildPulseIntelligenceReportHtml({
    title: "Driver Performance Report",
    companyName,
    filterCaption: dateRangeLabel,
    summaryCards: [
      { label: "Drivers", value: String(rows.length) },
      { label: "Total Trips", value: String(rows.reduce((s, r) => s + r.trips, 0)) },
      { label: "Total Revenue", value: inr(rows.reduce((s, r) => s + r.revenue, 0)) },
      { label: "Total Earnings", value: inr(rows.reduce((s, r) => s + r.earnings, 0)) },
    ],
    columns: [
      { key: "driver",    label: "Driver",       align: "left",  width: "22%" },
      { key: "trips",     label: "Trips",        align: "right", width: "7%"  },
      { key: "revenue",   label: "Revenue",      align: "right", width: "14%" },
      { key: "margin",    label: "Margin",       align: "right", width: "14%" },
      { key: "earnings",  label: "Earnings",     align: "right", width: "14%" },
      { key: "onTime",    label: "On-Time %",    align: "right", width: "12%" },
      { key: "score",     label: "Score",        align: "right", width: "10%" },
      { key: "lane",      label: "Top Lane",     align: "left",  width: "20%" },
    ],
    rows: rows.map((row) => ({
      driver:   row.name,
      trips:    String(row.trips),
      revenue:  inr(row.revenue),
      margin:   inr(row.margin),
      earnings: inr(row.earnings),
      onTime:   pct(row.onTimePct),
      score:    String(row.performanceScore),
      lane:     row.topLane ?? "—",
    })),
    landscape: true,
  });
  await printOrShare(html, "Driver Performance Report", "pulse-fleet-drivers");
}

// ── Connections list ──────────────────────────────────────────────────────────

export async function exportConnectionsExcel(
  connections: ConnectedOrg[],
  companyName: string,
): Promise<void> {
  const wb = XLSX.utils.book_new();

  const header = ["Name", "Role", "Phone", "Location", "Status", "Total Trips"];
  const dataRows = connections.map((c) => [
    c.name,
    c.role,
    c.phone ?? "—",
    [c.city, c.state].filter(Boolean).join(", ") || c.business_location || "—",
    c.is_integrated ? "Integrated" : "Network",
    c.total_trips ?? "—",
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([
    [`Pulse Network Connections · ${companyName}`],
    [`Exported ${new Date().toLocaleDateString("en-IN")}`],
    [],
    header,
    ...dataRows,
  ]);
  sheet["!cols"] = [
    { wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, sheet, "Connections");

  await shareOrSave(wb, "pulse-network-connections", "Connections Export (Excel)");
}
