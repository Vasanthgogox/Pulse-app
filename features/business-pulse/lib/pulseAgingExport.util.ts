// expo-file-system SDK 54 moved writeAsStringAsync/cacheDirectory to the legacy entry.
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { Alert, Platform, Share } from "react-native";
import { prependPulseExcelBanner } from "@/lib/reportWatermark.util";
import { buildPulseIntelligenceReportHtml } from "@/lib/pulseReportPrint.util";
import type { PulseAgingReport } from "@/features/business-pulse/selectors/pulseAgingSelectors";

function escapeCsv(value: string): string {
  return value.includes(",") || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
}

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function agingKindLabel(kind: PulseAgingReport["kind"]): string {
  return kind === "receivable" ? "Accounts receivable" : "Accounts payable";
}

export function pulseAgingToHtml(report: PulseAgingReport, title: string, companyName?: string): string {
  const bucketRows = report.buckets.map((bucket) => ({
    bucket: bucket.label,
    items: String(bucket.count),
    amount: inr(bucket.amount),
    share: `${bucket.sharePct}%`,
  }));

  const lineRows = report.lines.map((line) => ({
    trip: line.tripRef,
    party: line.party,
    category: line.category,
    date: line.anchorDate,
    days: String(line.daysOutstanding),
    amount: inr(line.amount),
  }));

  const kindLabel = agingKindLabel(report.kind);
  return buildPulseIntelligenceReportHtml({
    title: `${title} — ${kindLabel}`,
    companyName,
    filterCaption: `${kindLabel} · Total outstanding: ${inr(report.totalOutstanding)}`,
    summaryCards: [
      { label: kindLabel, value: inr(report.totalOutstanding) },
      { label: "Line items", value: String(report.lines.length) },
      { label: "Buckets", value: String(report.buckets.length) },
    ],
    tables: [
      {
        sectionTitle: "Aging buckets",
        columns: [
          { key: "bucket", label: "Bucket", width: "28%" },
          { key: "items", label: "Items", align: "right", width: "14%" },
          { key: "amount", label: "Amount", align: "right", width: "28%" },
          { key: "share", label: "Share", align: "right", width: "14%" },
        ],
        rows: bucketRows,
      },
      {
        sectionTitle: "Line items",
        columns: [
          { key: "trip", label: "Trip", width: "14%" },
          { key: "party", label: "Party", width: "22%" },
          { key: "category", label: "Category", width: "16%" },
          { key: "date", label: "Date", width: "14%" },
          { key: "days", label: "Days", align: "right", width: "10%" },
          { key: "amount", label: "Amount", align: "right", width: "14%" },
        ],
        rows: lineRows,
      },
    ],
    landscape: report.lines.length > 40,
  });
}

export function buildPulseAgingWorkbook(report: PulseAgingReport): XLSX.WorkBook {
  const bucketSheet = prependPulseExcelBanner(
    [
      ["Bucket", "Items", "Amount", "Share %"],
      ...report.buckets.map((b) => [b.label, b.count, b.amount, b.sharePct]),
      [],
      ["Total outstanding", "", report.totalOutstanding, ""],
    ],
    report.kind === "receivable" ? "Accounts receivable aging" : "Accounts payable aging",
  );
  const lineSheet = prependPulseExcelBanner(
    [
      ["Trip", "Party", "Category", "Date", "Days", "Amount"],
      ...report.lines.map((line) => [
        line.tripRef,
        line.party,
        line.category,
        line.anchorDate,
        line.daysOutstanding,
        line.amount,
      ]),
    ],
    "Aging line items",
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(bucketSheet), "Buckets");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(lineSheet), "Lines");
  return workbook;
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

export async function exportPulseAgingPdf(
  report: PulseAgingReport,
  title: string,
  companyName?: string,
): Promise<void> {
  const html = pulseAgingToHtml(report, title, companyName);
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    Alert.alert("PDF", "Use your browser print dialog to save as PDF.");
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Aging report (PDF)",
      UTI: "com.adobe.pdf",
    });
    return;
  }
  await Share.share({ url: uri, title });
}

export async function exportPulseAgingExcel(report: PulseAgingReport): Promise<void> {
  const workbook = buildPulseAgingWorkbook(report);
  const stamp = Date.now();
  if (Platform.OS === "web") {
    const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const blob = new Blob([arrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    triggerWebDownload(blob, `pulse-aging-${stamp}.xlsx`);
    return;
  }
  const cacheDirectory = (FileSystem as { cacheDirectory?: string }).cacheDirectory;
  if (!cacheDirectory) throw new Error("No cache directory");
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  const uri = `${cacheDirectory}pulse-aging-${stamp}.xlsx`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: "base64" });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: "Aging report (Excel)",
      UTI: "org.openxmlformats.spreadsheetml.sheet",
    });
    return;
  }
  await Share.share({ url: uri, title: "Pulse aging.xlsx" });
}

export function pulseAgingToCsv(report: PulseAgingReport): string {
  const header = "Trip,Party,Category,Date,Days,Amount";
  const lines = report.lines.map((line) =>
    [
      escapeCsv(line.tripRef),
      escapeCsv(line.party),
      escapeCsv(line.category),
      line.anchorDate,
      line.daysOutstanding,
      line.amount,
    ].join(","),
  );
  return [header, ...lines].join("\n");
}
