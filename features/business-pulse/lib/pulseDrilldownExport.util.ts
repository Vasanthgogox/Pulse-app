// expo-file-system SDK 54 moved writeAsStringAsync/cacheDirectory to the legacy entry.
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { Alert, Platform, Share } from "react-native";
import { prependPulseExcelBanner } from "@/lib/reportWatermark.util";
import { buildPulseIntelligenceReportHtml } from "@/lib/pulseReportPrint.util";
import {
  drilldownViewSummaryCards,
  formatDrilldownCell,
  type PulseDrilldownView,
} from "@/features/business-pulse/lib/pulseDrilldownContext.util";

export type { PulseDrilldownView } from "@/features/business-pulse/lib/pulseDrilldownContext.util";

function escapeCsv(value: string): string {
  return value.includes(",") || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
}

export function pulseDrilldownToCsv(view: PulseDrilldownView): string {
  const header = view.columns.map((c) => c.label).join(",");
  const lines = view.rows.map((row) =>
    view.columns
      .map((col) => {
        const raw = formatDrilldownCell(row, col);
        return col.isMoney || col.key === "trip" || col.key === "route" || col.key === "client"
          ? escapeCsv(raw)
          : raw;
      })
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function pulseDrilldownToHtml(
  view: PulseDrilldownView,
  title: string,
  companyName?: string,
): string {
  const pdfColumns = view.columns.map((col) => ({
    key: col.key,
    label: col.label,
    align: col.align ?? ("left" as const),
    width: col.pdfWidth,
  }));

  const pdfRows = view.rows.map((row) => {
    const out: Record<string, string> = {};
    for (const col of view.columns) {
      out[col.key] = formatDrilldownCell(row, col);
    }
    return out;
  });

  return buildPulseIntelligenceReportHtml({
    title,
    companyName,
    filterCaption: `${view.lensLabel} · ${view.filterCaption}`,
    summaryCards: drilldownViewSummaryCards(view).map((c) => ({
      label: c.label,
      value: c.value,
    })),
    columns: pdfColumns,
    rows: pdfRows,
    landscape: view.columns.length > 8,
  });
}

export function buildPulseDrilldownWorkbook(view: PulseDrilldownView): XLSX.WorkBook {
  const header = view.columns.map((c) => c.label);
  const dataRows = view.rows.map((row) =>
    view.columns.map((col) => {
      const raw = row[col.key];
      if (col.isMoney && typeof raw === "number") return raw;
      return raw ?? "";
    }),
  );

  const sheetRows = prependPulseExcelBanner(
    [header, ...dataRows],
    `${view.lensLabel} · ${view.filterCaption}`,
  );
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Business Pulse");
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

export async function exportPulseDrilldownPdf(
  view: PulseDrilldownView,
  title: string,
  companyName?: string,
): Promise<void> {
  const html = pulseDrilldownToHtml(view, title, companyName);
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    Alert.alert("PDF", "Use your browser print dialog to save as PDF.");
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Business Pulse report (PDF)",
      UTI: "com.adobe.pdf",
    });
    return;
  }
  await Share.share({ url: uri, title });
}

export async function exportPulseDrilldownExcel(view: PulseDrilldownView): Promise<void> {
  const workbook = buildPulseDrilldownWorkbook(view);
  const stamp = Date.now();
  if (Platform.OS === "web") {
    const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const blob = new Blob([arrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    triggerWebDownload(blob, `business-pulse-${stamp}.xlsx`);
    return;
  }
  const cacheDirectory = (FileSystem as { cacheDirectory?: string }).cacheDirectory;
  if (!cacheDirectory) throw new Error("No cache directory");
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  const uri = `${cacheDirectory}business-pulse-${stamp}.xlsx`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: "base64" });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: "Business Pulse report (Excel)",
      UTI: "org.openxmlformats.spreadsheetml.sheet",
    });
    return;
  }
  await Share.share({ url: uri, title: "Business Pulse.xlsx" });
}
