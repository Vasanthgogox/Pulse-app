/**
 * Ledger report preview: table of transactions with Print, Share (WhatsApp), and Download.
 * Shown when user taps Report icon on Treasury or entity detail.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
// expo-file-system SDK 54 moved writeAsStringAsync/cacheDirectory to the legacy entry.
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Share,
  Alert,
  Linking,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { PulseBrandMark } from '@/components/brand/PulseBrandMark';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { PULSE_METRONIC } from '@/features/business-pulse/components/pulseEnterpriseStyles';
import { prependPulseExcelBanner } from '@/lib/reportWatermark.util';
import { buildPulseIntelligenceReportHtml } from '@/lib/pulseReportPrint.util';
import { printHtmlOnWeb, runAfterOverlayCloses } from '@/lib/webPrint.util';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTripOperationalDisplay } from "@/features/operations/display";
import type { LedgerRow } from '../services/finance.service';

function formatAmount(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

function formatDate(s: string): string {
  if (!s) return '—';
  const d = s.slice(0, 10);
  const [y, m, day] = d.split('-');
  const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  return `${day} ${months[Number(m) - 1]} ${y}`;
}

function sortLedgerRowsByDate(rows: LedgerRow[]): LedgerRow[] {
  return [...rows].sort((a, b) => {
    const dateA = a.transaction_date || a.created_at || '';
    const dateB = b.transaction_date || b.created_at || '';
    const dateCmp = dateB.localeCompare(dateA);
    if (dateCmp !== 0) return dateCmp;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
}

function getOperationalRef(row: LedgerRow): string {
  const tripRef = getTripOperationalDisplay({
    trip_operational_code: row.trips?.trip_operational_code ?? null,
    trip_code: row.trips?.trip_code ?? null,
    display_trip_id: row.trips?.["display_trip_id"] ?? null,
    trip_number: row["trip_number"] ?? null,
  });
  return tripRef !== "—" ? tripRef : row.description || "—";
}

function ledgerToCsv(rows: LedgerRow[]): string {
  const header = 'Party,Description,Trip/Ref,Date,Amount In,Amount Out';
  const totalIn = rows.reduce((s, r) => s + (r.amount_in ?? 0), 0);
  const totalOut = rows.reduce((s, r) => s + (r.amount_out ?? 0), 0);
  const escape = (v: string) => (v.includes(',') || v.includes('"') ? `"${String(v).replace(/"/g, '""')}"` : v);
  const lines = [
    header,
    ...rows.map((r) =>
      [
        escape(r.party_name ?? ''),
        escape(r.description ?? ''),
        escape(getOperationalRef(r)),
        (r.transaction_date ?? '').slice(0, 10),
        r.amount_in ?? 0,
        r.amount_out ?? 0,
      ].join(',')
    ),
    '',
    `Total Received,${totalIn}`,
    `Total Paid,${totalOut}`,
  ];
  return lines.join('\n');
}

function ledgerToPlainText(rows: LedgerRow[], totalIn: number, totalOut: number): string {
  const lines = [
    'LEDGER REPORT',
    '—',
    'Party | Ref | Date | In | Out',
    ...rows.map((r) =>
      [
        (r.party_name ?? '—').replace(/\|/g, ' '),
        getOperationalRef(r).replace(/\|/g, ' '),
        (r.transaction_date ?? '').slice(0, 10),
        (r.amount_in ?? 0) > 0 ? formatAmount(r.amount_in!) : '—',
        (r.amount_out ?? 0) > 0 ? formatAmount(r.amount_out!) : '—',
      ].join(' | ')
    ),
    '—',
    `Total Received: ${formatAmount(totalIn)}`,
    `Total Paid: ${formatAmount(totalOut)}`,
  ];
  return lines.join('\n');
}

function ledgerToHtml(
  rows: LedgerRow[],
  totalIn: number,
  totalOut: number,
  reportTitle = 'Ledger Report',
  dateRangeLabel?: string,
): string {
  return buildPulseIntelligenceReportHtml({
    title: reportTitle,
    dateRangeLabel,
    summaryCards: [
      { label: 'Received', value: formatAmount(totalIn), tone: 'in' },
      { label: 'Paid', value: formatAmount(totalOut), tone: 'out' },
      {
        label: 'Net',
        value: formatAmount(Math.abs(totalIn - totalOut)),
        tone: totalIn >= totalOut ? 'in' : 'out',
      },
    ],
    columns: [
      { key: 'party', label: 'Party', width: '26%' },
      { key: 'ref', label: 'Ref / Trip', width: '30%' },
      { key: 'date', label: 'Date', width: '14%' },
      { key: 'in', label: 'In', align: 'right', width: '15%' },
      { key: 'out', label: 'Out', align: 'right', width: '15%' },
    ],
    rows: rows.map((r) => ({
      party: r.party_name ?? '—',
      ref: getOperationalRef(r),
      date: formatDate(r.transaction_date ?? r.created_at ?? ''),
      in: (r.amount_in ?? 0) > 0 ? formatAmount(r.amount_in!) : '—',
      out: (r.amount_out ?? 0) > 0 ? formatAmount(r.amount_out!) : '—',
    })),
  });
}

function buildLedgerWorkbook(
  rows: LedgerRow[],
  totalIn: number,
  totalOut: number,
  periodLabel?: string,
): XLSX.WorkBook {
  const sheetRows = prependPulseExcelBanner(
    [
      ['Party', 'Description', 'Trip/Ref', 'Date', 'Amount In', 'Amount Out'],
      ...rows.map((r) => [
        r.party_name ?? '',
        r.description ?? '',
        getOperationalRef(r),
        (r.transaction_date ?? '').slice(0, 10),
        r.amount_in ?? 0,
        r.amount_out ?? 0,
      ]),
      [],
      ['Total Received', '', '', '', totalIn, ''],
      ['Total Paid', '', '', '', '', totalOut],
    ],
    periodLabel ?? 'Ledger report',
  );
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ledger Report');
  return workbook;
}

function triggerWebDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

const TABLE_HPAD = Layout.screenPaddingHorizontal;
const COLUMN_GAP = 10;

function parseReportTitle(title: string): { primary: string; secondary?: string } {
  const sep = ' — ';
  const idx = title.indexOf(sep);
  if (idx === -1) return { primary: title };
  return {
    primary: title.slice(0, idx).trim(),
    secondary: title.slice(idx + sep.length).trim(),
  };
}

function getCustomColumnWidth(key: string): number {
  switch (key) {
    case 'entity': return 176;
    case 'trips': return 56;
    case 'trip': return 118;
    case 'route': return 232;
    case 'model': return 96;
    case 'supplier': return 176;
    case 'client': return 156;
    case 'mission': return 92;
    case 'status': return 100;
    case 'partnerNote': return 132;
    case 'sales':
    case 'cost':
    case 'paid':
    case 'received':
    case 'earned':
    case 'payables':
    case 'expense':
    case 'contract':
      return 92;
    case 'mySales':
    case 'themSales':
    case 'myReceived':
    case 'themReceived':
    case 'due':
    case 'pnl':
    case 'margin':
      return 88;
    case 'txns': return 48;
    case 'lastTxn': return 80;
    case 'settlement': return 72;
    case 'commissionBasis': return 108;
    case 'sync': return 56;
    case 'you':
    case 'partner':
      return 84;
    case 'refs': return 148;
    case 'date': return 92;
    default: return 96;
  }
}

function getCustomCellMaxLines(key: string): number {
  switch (key) {
    case 'trip':
    case 'route':
    case 'supplier':
    case 'client':
    case 'partnerNote':
    case 'refs':
    case 'commissionBasis':
      return 2;
    default:
      return 1;
  }
}

function isMoneyColumn(key: string): boolean {
  return (
    key === 'sales' ||
    key === 'cost' ||
    key === 'paid' ||
    key === 'received' ||
    key === 'earned' ||
    key === 'payables' ||
    key === 'expense' ||
    key === 'due' ||
    key === 'pnl' ||
    key === 'margin' ||
    key === 'contract' ||
    key === 'mySales' ||
    key === 'themSales' ||
    key === 'myReceived' ||
    key === 'themReceived' ||
    key === 'settlement'
  );
}

export interface LedgerReportModalProps {
  visible: boolean;
  onClose: () => void;
  transactions: LedgerRow[];
  /** Optional title override */
  title?: string;
  /** When true, hides Cash In / Cash Out summary (e.g. custom shared-ledger export). */
  hideCashSummary?: boolean;
  /** Inclusive calendar range shown in tiny type under the title. */
  periodLabel?: string;
  customReport?: {
    columns: Array<{
      key: string;
      label: string;
      align?: 'left' | 'right' | 'center';
    }>;
    rows: Array<Record<string, string | number | null | undefined>>;
  };
}

export function LedgerReportModal({
  visible,
  onClose,
  transactions,
  title,
  hideCashSummary = false,
  periodLabel,
  customReport,
}: LedgerReportModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [downloadInProgress, setDownloadInProgress] = useState(false);
  const [formatPickerVisible, setFormatPickerVisible] = useState(false);
  const [formatPickerMode, setFormatPickerMode] = useState<'download' | 'share'>('download');
  const displayTitle = title ?? t("ledgerReport");
  const sortedTransactions = useMemo(
    () => sortLedgerRowsByDate(transactions),
    [transactions],
  );
  const totalIn = sortedTransactions.reduce((s, r) => s + (r.amount_in ?? 0), 0);
  const totalOut = sortedTransactions.reduce((s, r) => s + (r.amount_out ?? 0), 0);
  const netAmount = totalIn - totalOut;
  const plainText = ledgerToPlainText(sortedTransactions, totalIn, totalOut);
  const csv = ledgerToCsv(sortedTransactions);
  const html = ledgerToHtml(sortedTransactions, totalIn, totalOut, displayTitle, periodLabel);
  const isCustomReport = !!customReport;
  const activePlainText = useMemo(() => {
    const periodLine = periodLabel?.trim() || null;
    if (!customReport) {
      return periodLine ? `${displayTitle}\n${periodLine}\n\n${plainText}` : plainText;
    }
    const header = customReport.columns.map((c) => c.label).join(' | ');
    const lines = customReport.rows.map((row) =>
      customReport.columns.map((c) => String(row[c.key] ?? '—').replace(/\|/g, ' ')).join(' | ')
    );
    return [displayTitle.toUpperCase(), periodLine, '—', header, ...lines]
      .filter((line) => line != null && line !== '')
      .join('\n');
  }, [customReport, plainText, displayTitle, periodLabel]);
  const activeCsv = useMemo(() => {
    if (!customReport) return csv;
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = customReport.columns.map((c) => escape(c.label)).join(',');
    const rows = customReport.rows.map((row) =>
      customReport.columns.map((c) => escape(row[c.key] ?? '')).join(',')
    );
    return [header, ...rows].join('\n');
  }, [customReport, csv]);
  const activeHtml = useMemo(() => {
    if (!customReport) return html;
    const colWidth = `${Math.max(8, Math.floor(100 / customReport.columns.length))}%`;
    return buildPulseIntelligenceReportHtml({
      title: displayTitle,
      dateRangeLabel: periodLabel,
      columns: customReport.columns.map((col) => ({
        key: col.key,
        label: col.label,
        align: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
        width: colWidth,
      })),
      rows: customReport.rows.map((row) => {
        const out: Record<string, string> = {};
        for (const col of customReport.columns) {
          const value = row[col.key];
          out[col.key] = value == null || value === '' ? '—' : String(value);
        }
        if (row.tripDate != null && String(row.tripDate).trim() !== '') {
          out.tripDate = String(row.tripDate);
        }
        return out;
      }),
      landscape: customReport.columns.length > 7,
    });
  }, [customReport, html, displayTitle, periodLabel]);

  const reportTitleParts = useMemo(
    () => parseReportTitle(displayTitle),
    [displayTitle],
  );

  const customTableMinWidth = useMemo(() => {
    if (!customReport) return 0;
    const columnSum = customReport.columns.reduce(
      (sum, col) => sum + getCustomColumnWidth(col.key),
      0,
    );
    const gaps = Math.max(0, customReport.columns.length - 1) * COLUMN_GAP;
    return columnSum + gaps + TABLE_HPAD * 2;
  }, [customReport]);

  const customTableWidth = Math.max(customTableMinWidth, windowWidth);
  const showScrollHint =
    isCustomReport &&
    customReport &&
    (customReport.columns.length > 4 || customTableMinWidth > windowWidth);
  const recordCountLabel = isCustomReport
    ? `${customReport!.rows.length} ${customReport!.rows.length === 1 ? 'record' : 'records'}`
    : `${sortedTransactions.length} ${sortedTransactions.length === 1 ? 'entry' : 'entries'}`;

  const getCustomValueColor = (key: string, value: string): string | undefined => {
    const v = value.trim();
    const isDashOrZero =
      v === '—' ||
      v === '₹0' ||
      v === '₹ 0' ||
      v === '-₹0' ||
      v === '0' ||
      v === '0.0%';
    if (key === 'sync') return v === 'Fix' ? Theme.teslaRed : Theme.darkGreen;
    if (key === 'due') return isDashOrZero ? Theme.darkGreen : Theme.teslaRed;
    if (key === 'pnl') {
      if (isDashOrZero) return Theme.textMuted;
      return v.startsWith('-') ? Theme.teslaRed : Theme.darkGreen;
    }
    if (
      key === 'margin' ||
      key === 'received' ||
      key === 'paid' ||
      key === 'settlement'
    ) {
      return v.startsWith('-') ? Theme.teslaRed : Theme.darkGreen;
    }
    return undefined;
  };

  const handlePrint = async () => {
    try {
      if (Platform.OS === 'web') {
        const ok = await printHtmlOnWeb(activeHtml, { title: displayTitle });
        if (!ok) {
          Alert.alert(
            'Print',
            'Could not open the print preview. Try Download PDF instead.',
          );
        }
        return;
      }
      await Print.printAsync({ html: activeHtml });
    } catch {
      Share.share({
        message: activePlainText,
        title: 'Ledger Report – Print or Save',
      }).catch(() => Alert.alert('Print', 'Use Share or Download to print from another app.'));
    }
  };

  const handleWhatsApp = () => {
    const url = `whatsapp://send?text=${encodeURIComponent(activePlainText)}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Share.share({ message: activePlainText, title: 'Ledger Report' }).catch(() => {});
    }).catch(() => Share.share({ message: activePlainText, title: 'Ledger Report' }).catch(() => {}));
  };

  const handleShare = () => {
    if (downloadInProgress) return;
    setFormatPickerMode('share');
    setFormatPickerVisible(true);
  };

  const handlePdfAction = async (mode: 'download' | 'share') => {
    if (downloadInProgress) return;
    setDownloadInProgress(true);
    try {
      if (Platform.OS === 'web') {
        const ok = await printHtmlOnWeb(activeHtml, { title: displayTitle });
        if (!ok) {
          Alert.alert(
            'PDF unavailable',
            'Could not open the print preview. Check pop-up blockers or try Print from the toolbar.',
          );
          return;
        }
        if (mode === 'share') {
          Alert.alert(
            'Share PDF',
            'In the print dialog, choose Save as PDF, then attach the file in your email or chat app.',
          );
        }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html: activeHtml });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or share ledger report PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Share.share({
          url: uri,
          title: 'Ledger Report',
          message: 'Save or share the ledger report PDF.',
        });
      }
    } catch {
      try {
        await Share.share({
          message: activeCsv,
          title: 'Ledger Report',
        });
      } catch {
        Alert.alert(
          'PDF unavailable',
          'Could not generate PDF. You can use Share above to save the report as text.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setDownloadInProgress(false);
    }
  };

  const handleExcelAction = async (mode: 'download' | 'share') => {
    if (downloadInProgress) return;
    setDownloadInProgress(true);
    const excelSubtitle = periodLabel
      ? `${displayTitle} · ${periodLabel}`
      : displayTitle;
    try {
      if (Platform.OS === 'web') {
        const workbook = isCustomReport
          ? (() => {
              const ws = XLSX.utils.aoa_to_sheet(
                prependPulseExcelBanner(
                  [
                    customReport!.columns.map((c) => c.label),
                    ...customReport!.rows.map((row) =>
                      customReport!.columns.map((c) => row[c.key] ?? ''),
                    ),
                  ],
                  excelSubtitle,
                ),
              );
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Report');
              return wb;
            })()
          : buildLedgerWorkbook(sortedTransactions, totalIn, totalOut, periodLabel);
        const arrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob(
          [arrayBuffer],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        );
        triggerWebDownload(blob, `ledger-report-${Date.now()}.xlsx`);
        if (mode === 'share') {
          Alert.alert('Share Excel', 'Excel has been downloaded. Attach it in your email app.');
        }
        return;
      }
      const cacheDirectory = (FileSystem as { cacheDirectory?: string }).cacheDirectory;
      if (!cacheDirectory) throw new Error('No cache directory available');
      const workbook = isCustomReport
        ? (() => {
            const ws = XLSX.utils.aoa_to_sheet(
              prependPulseExcelBanner(
                [
                  customReport!.columns.map((c) => c.label),
                  ...customReport!.rows.map((row) =>
                    customReport!.columns.map((c) => row[c.key] ?? ''),
                  ),
                ],
                excelSubtitle,
              ),
            );
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            return wb;
          })()
        : buildLedgerWorkbook(sortedTransactions, totalIn, totalOut, periodLabel);
      const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const uri = `${cacheDirectory}ledger-report-${Date.now()}.xlsx`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Save or share ledger report Excel',
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
        });
      } else {
        await Share.share({
          url: uri,
          title: 'Ledger Report',
          message: 'Save or share the ledger report Excel file.',
        });
      }
    } catch {
      try {
        await Share.share({
          message: activeCsv,
          title: 'Ledger Report.csv',
        });
      } catch {
        Alert.alert(
          'Excel unavailable',
          'Could not generate Excel. You can use Share above to save the report as text.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setDownloadInProgress(false);
    }
  };

  const handleDownload = () => {
    if (downloadInProgress) return;
    setFormatPickerMode('download');
    setFormatPickerVisible(true);
  };

  const handleSelectPdf = () => {
    const mode = formatPickerMode;
    setFormatPickerVisible(false);
    runAfterOverlayCloses(() => {
      void handlePdfAction(mode);
    });
  };

  const handleSelectExcel = () => {
    const mode = formatPickerMode;
    setFormatPickerVisible(false);
    runAfterOverlayCloses(() => {
      void handleExcelAction(mode);
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, styles.overlayFull]}>
        <View style={[styles.sheet, styles.sheetLight, styles.sheetFull]}>
          <View style={[styles.header, { paddingTop: Layout.headerPaddingBelowInset + insets.top }]}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle} numberOfLines={2}>
                {reportTitleParts.primary}
              </Text>
              {periodLabel ? (
                <Text style={styles.headerPeriod} numberOfLines={1}>
                  {periodLabel}
                </Text>
              ) : null}
              {reportTitleParts.secondary ? (
                <Text style={styles.headerReportKind} numberOfLines={1}>
                  {reportTitleParts.secondary}
                </Text>
              ) : null}
              <View style={styles.previewMetaRow}>
                <Text style={styles.previewSubtitle}>Report preview</Text>
                <View style={styles.recordCountPill}>
                  <Text style={styles.recordCountPillText}>{recordCountLabel}</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <FontAwesome name="times" size={16} color={PULSE_METRONIC.text} />
            </TouchableOpacity>
          </View>
          {!hideCashSummary ? (
            <View style={styles.summaryRow}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>{t("cashIn")}</Text>
                <Text style={[styles.summaryValue, styles.positive]}>{formatAmount(totalIn)}</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>{t("cashOut")}</Text>
                <Text style={[styles.summaryValue, styles.negative]}>{formatAmount(totalOut)}</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>Net balance</Text>
                <Text style={[styles.summaryValue, netAmount >= 0 ? styles.positive : styles.negative]}>
                  {formatAmount(Math.abs(netAmount))}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.previewCanvas}>
          {!isCustomReport ? (
            <View style={[styles.tableHeader, styles.ledgerTableHeader]}>
              <Text style={[styles.th, styles.thEntity]}>Party / ref</Text>
              <Text style={[styles.th, styles.thDate]}>Date</Text>
              <Text style={[styles.th, styles.thNumLedger]}>{t("cashIn")}</Text>
              <Text style={[styles.th, styles.thNumLedger]}>{t("cashOut")}</Text>
            </View>
          ) : null}

          {isCustomReport ? (
            <View style={styles.customTableShell}>
              {showScrollHint ? (
                <View style={styles.scrollHintRow}>
                  <Text style={styles.scrollHintText}>
                    Scroll horizontally to view all columns
                  </Text>
                  <FontAwesome name="long-arrow-right" size={11} color={PULSE_METRONIC.muted} />
                </View>
              ) : null}
              <ScrollView
                horizontal
                style={styles.customTableScroll}
                showsHorizontalScrollIndicator
                contentContainerStyle={styles.customTableScrollContent}
              >
                <View style={[styles.customTablePane, { width: customTableWidth }]}>
                  <View style={[styles.tableHeader, styles.customTableHeader]}>
                    {customReport!.columns.map((col) => (
                      <Text
                        key={`hdr-${col.key}`}
                        style={[
                          styles.th,
                          styles.thFixed,
                          col.align === 'right' ? styles.thNum : undefined,
                          {
                            width: getCustomColumnWidth(col.key),
                            textAlign:
                              col.align === 'right'
                                ? 'right'
                                : col.align === 'center'
                                  ? 'center'
                                  : 'left',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {col.label}
                      </Text>
                    ))}
                  </View>

                  <ScrollView
                    style={styles.list}
                    nestedScrollEnabled
                    contentContainerStyle={[
                      styles.listContent,
                      customReport!.rows.length === 0 && styles.listContentEmpty,
                    ]}
                    showsVerticalScrollIndicator
                  >
                    {customReport!.rows.length === 0 ? (
                      <Text style={styles.empty}>{t("noLedgerEntries")}</Text>
                    ) : (
                      customReport!.rows.map((row, idx) => (
                        <View
                          key={`custom-row-${idx}`}
                          style={[styles.row, styles.customDataRow, idx % 2 === 1 && styles.altRow]}
                        >
                          {customReport!.columns.map((col) => {
                            const raw =
                              row[col.key] == null ? '—' : String(row[col.key]);
                            const valueColor =
                              getCustomValueColor(col.key, raw) ?? PULSE_METRONIC.text;
                            const money = isMoneyColumn(col.key);
                            const tripDate =
                              col.key === 'trip'
                                ? String(row.tripDate ?? '').trim()
                                : '';
                            const cellStyle = [
                              styles.cellFixed,
                              money ? styles.cellMoney : undefined,
                              col.align === 'right' ? styles.cellNum : undefined,
                              {
                                width: getCustomColumnWidth(col.key),
                                textAlign:
                                  (col.align === 'right'
                                    ? 'right'
                                    : col.align === 'center'
                                      ? 'center'
                                      : 'left') as 'left' | 'center' | 'right',
                                color: valueColor,
                              },
                            ];
                            if (col.key === 'trip' && tripDate && tripDate !== '—') {
                              return (
                                <View
                                  key={`${idx}-${col.key}`}
                                  style={{ width: getCustomColumnWidth(col.key) }}
                                >
                                  <Text
                                    style={cellStyle}
                                    numberOfLines={getCustomCellMaxLines(col.key)}
                                  >
                                    {raw}
                                  </Text>
                                  <Text style={styles.tripDateSub} numberOfLines={1}>
                                    {tripDate}
                                  </Text>
                                </View>
                              );
                            }
                            return (
                              <Text
                                key={`${idx}-${col.key}`}
                                style={cellStyle}
                                numberOfLines={getCustomCellMaxLines(col.key)}
                              >
                                {raw}
                              </Text>
                            );
                          })}
                        </View>
                      ))
                    )}
                  </ScrollView>
                </View>
              </ScrollView>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={[
                styles.listContent,
                sortedTransactions.length === 0 && styles.listContentEmpty,
              ]}
              showsVerticalScrollIndicator={true}
            >
              {sortedTransactions.length === 0 ? (
                <Text style={styles.empty}>{t("noLedgerEntries")}</Text>
              ) : (
                sortedTransactions.map((row, idx) => (
                  <View key={row.id} style={[styles.row, styles.ledgerDataRow, idx % 2 === 1 && styles.altRow]}>
                    <View style={styles.cellEntity}>
                      <Text style={styles.entityName} numberOfLines={1}>{row.party_name}</Text>
                      <Text style={styles.entityDesc} numberOfLines={2}>
                        {getOperationalRef(row)}
                      </Text>
                    </View>
                    <Text style={styles.cellDate}>{formatDate(row.transaction_date)}</Text>
                    <Text style={[styles.cellNum, styles.cellNumLedger, styles.positive]}>
                      {(row.amount_in ?? 0) > 0 ? formatAmount(row.amount_in!) : '—'}
                    </Text>
                    <Text style={[styles.cellNum, styles.cellNumLedger, styles.negative]}>
                      {(row.amount_out ?? 0) > 0 ? formatAmount(row.amount_out!) : '—'}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}
            <View
              pointerEvents="none"
              style={styles.previewWatermarkLayer}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.previewWatermarkMark}>
                <PulseBrandMark
                  size="display"
                  textStyle={styles.previewWatermarkText}
                />
              </View>
            </View>
          </View>

          <View style={[styles.actionBar, { paddingBottom: 12 + insets.bottom }]}>
            <TouchableOpacity style={styles.actionBtn} onPress={handlePrint} activeOpacity={0.85}>
              <View style={styles.actionIconWrap}>
                <FontAwesome name="print" size={15} color={PULSE_METRONIC.text} />
              </View>
              <Text style={styles.actionBtnText}>Print</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleWhatsApp} activeOpacity={0.85}>
              <View style={styles.actionIconWrap}>
                <FontAwesome name="whatsapp" size={16} color={PULSE_METRONIC.text} />
              </View>
              <Text style={styles.actionBtnText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.85}>
              <View style={styles.actionIconWrap}>
                <FontAwesome name="share-alt" size={15} color={PULSE_METRONIC.text} />
              </View>
              <Text style={styles.actionBtnText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, downloadInProgress && styles.actionBtnDisabled]}
              onPress={handleDownload}
              disabled={downloadInProgress}
              activeOpacity={0.85}
            >
              <View style={styles.actionIconWrap}>
                {downloadInProgress ? (
                  <LoadingIndicator size="small" color={PULSE_METRONIC.text} />
                ) : (
                  <FontAwesome name="download" size={15} color={PULSE_METRONIC.text} />
                )}
              </View>
              <Text style={styles.actionBtnText}>
                {downloadInProgress ? 'Generating…' : 'Download'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <Modal
        visible={formatPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFormatPickerVisible(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          onPress={() => setFormatPickerVisible(false)}
        >
          <Pressable
            style={styles.downloadModalCard}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.downloadModalTitle}>
              {formatPickerMode === 'share' ? 'Share format' : 'Download format'}
            </Text>
            <Text style={styles.downloadModalSubtitle}>
              {formatPickerMode === 'share'
                ? 'Choose file format to share'
                : 'Choose your preferred report file type'}
            </Text>
            <View style={styles.downloadFormatRow}>
              <TouchableOpacity
                style={styles.downloadFormatTile}
                onPress={handleSelectPdf}
                activeOpacity={0.85}
              >
                <FontAwesome name="file-pdf-o" size={22} color={Theme.teslaRed} />
                <Text style={styles.downloadFormatTileTitle}>PDF</Text>
                <Text style={styles.downloadFormatTileHint}>
                  {formatPickerMode === 'share' ? 'Share document' : 'Download PDF'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.downloadFormatTile}
                onPress={handleSelectExcel}
                activeOpacity={0.85}
              >
                <FontAwesome name="file-excel-o" size={22} color={Theme.darkGreen} />
                <Text style={styles.downloadFormatTileTitle}>Excel</Text>
                <Text style={styles.downloadFormatTileHint}>
                  {formatPickerMode === 'share' ? 'Share spreadsheet' : 'Download .xlsx'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.downloadOption, styles.downloadCancelOption]}
              onPress={() => setFormatPickerVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.downloadOptionText, styles.downloadCancelOptionText]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: PULSE_METRONIC.canvas,
  },
  overlayFull: {
    justifyContent: 'flex-start',
  },
  sheet: {
    flex: 1,
    flexDirection: 'column',
  },
  sheetFull: {
    flex: 1,
  },
  sheetLight: {
    backgroundColor: PULSE_METRONIC.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: TABLE_HPAD,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_METRONIC.border,
    backgroundColor: Theme.cardWhite,
  },
  headerTitleRow: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: PULSE_METRONIC.text,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  headerPeriod: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
    letterSpacing: 0.1,
  },
  headerReportKind: {
    fontSize: 13,
    fontWeight: '600',
    color: PULSE_METRONIC.text,
    marginTop: 2,
    letterSpacing: -0.1,
  },
  previewSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
  },
  previewMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  recordCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#EEF3FA',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PULSE_METRONIC.border,
  },
  recordCountPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: PULSE_METRONIC.text,
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PULSE_METRONIC.border,
    borderRadius: 18,
    marginTop: 2,
  },
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: TABLE_HPAD,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PULSE_METRONIC.border,
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PULSE_METRONIC.border,
    minHeight: Layout.minTouchTargetSize + 12,
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
  actionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F8FA',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: PULSE_METRONIC.text,
    letterSpacing: -0.1,
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: TABLE_HPAD,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_METRONIC.border,
    backgroundColor: '#F8FAFC',
  },
  summaryCell: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PULSE_METRONIC.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: PULSE_METRONIC.muted,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  positive: { color: Theme.darkGreen },
  negative: { color: Theme.teslaRed },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TABLE_HPAD,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_METRONIC.border,
    backgroundColor: '#F8FAFC',
    gap: COLUMN_GAP,
  },
  customTableHeader: {
    minHeight: 40,
  },
  th: {
    fontSize: 10,
    fontWeight: '700',
    color: PULSE_METRONIC.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  thEntity: { flex: 1, minWidth: 0 },
  thFixed: { flexShrink: 0 },
  thDate: { width: 80, flexShrink: 0 },
  thNum: { textAlign: 'right', flexShrink: 0 },
  thNumLedger: { width: 72, textAlign: 'right', flexShrink: 0 },
  ledgerTableHeader: {
    gap: COLUMN_GAP,
  },
  customTableShell: {
    flex: 1,
    minHeight: 120,
    backgroundColor: Theme.cardWhite,
  },
  previewCanvas: {
    flex: 1,
    minHeight: 120,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Theme.cardWhite,
  },
  previewWatermarkLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  previewWatermarkMark: {
    opacity: 0.2,
    transform: [{ rotate: '-22deg' }],
  },
  previewWatermarkText: {
    fontSize: 80,
    lineHeight: 88,
    fontWeight: '700',
    letterSpacing: -1.6,
  },
  scrollHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    paddingHorizontal: TABLE_HPAD,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_METRONIC.border,
    backgroundColor: '#F5F8FA',
  },
  scrollHintText: {
    fontSize: 11,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
  },
  customTableScroll: {
    flex: 1,
    minHeight: 120,
    backgroundColor: Theme.cardWhite,
  },
  customTableScrollContent: {
    flexGrow: 1,
  },
  customTablePane: {
    flex: 1,
    minHeight: 120,
  },
  list: {
    flex: 1,
    minHeight: 120,
    backgroundColor: Theme.cardWhite,
  },
  listContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TABLE_HPAD,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_METRONIC.border,
    gap: COLUMN_GAP,
  },
  altRow: {
    backgroundColor: '#FCFDFE',
  },
  customDataRow: {
    alignItems: 'flex-start',
    minHeight: 48,
    paddingVertical: 11,
  },
  ledgerDataRow: {
    alignItems: 'flex-start',
    minHeight: 48,
  },
  cellEntity: { flex: 1, minWidth: 0 },
  entityName: {
    fontSize: 12,
    fontWeight: '700',
    color: PULSE_METRONIC.text,
    lineHeight: 17,
  },
  entityDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
    marginTop: 3,
    lineHeight: 15,
  },
  cellDate: {
    width: 80,
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
  },
  cellNum: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  cellNumLedger: {
    width: 72,
  },
  cellFixed: {
    fontSize: 11,
    fontWeight: '500',
    color: PULSE_METRONIC.text,
    flexShrink: 0,
    lineHeight: 17,
  },
  tripDateSub: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
    letterSpacing: 0.15,
    lineHeight: 12,
  },
  cellMoney: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    padding: 28,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    color: PULSE_METRONIC.muted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    padding: 16,
    minWidth: 260,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimary,
    marginBottom: 12,
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  modalOptionText: {
    fontSize: 16,
    color: Theme.textPrimary,
  },
  downloadModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Theme.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  downloadModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
  },
  downloadModalSubtitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 4,
    marginBottom: 14,
  },
  downloadFormatRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 10,
  },
  downloadFormatTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 108,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
  },
  downloadFormatTileTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
  },
  downloadFormatTileHint: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  downloadOption: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  downloadOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  downloadCancelOption: {
    backgroundColor: Theme.surfaceGray,
    marginBottom: 0,
  },
  downloadCancelOptionText: {
    color: Theme.textSecondary,
  },
});
