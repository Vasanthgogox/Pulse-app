/**
 * Ledger report preview: table of transactions with Print, Share (WhatsApp), and Download.
 * Shown when user taps Report icon on Treasury or entity detail.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Share, Alert, Linking,  Platform } from 'react-native';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
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
    display_trip_id: row.trips?.display_trip_id ?? null,
    trip_number: row.trip_number ?? null,
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

function ledgerToHtml(rows: LedgerRow[], totalIn: number, totalOut: number): string {
  const rowsHtml = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.party_name ?? '')}</td><td>${escapeHtml(getOperationalRef(r))}</td><td>${(r.transaction_date ?? '').slice(0, 10)}</td><td>${(r.amount_in ?? 0) > 0 ? formatAmount(r.amount_in!) : '—'}</td><td>${(r.amount_out ?? 0) > 0 ? formatAmount(r.amount_out!) : '—'}</td></tr>`
    )
    .join('');
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Ledger Report</title>
<style>body{font-family:system-ui;padding:16px;font-size:12px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background:#111;color:#fff;}
.total{font-weight:bold;margin-top:12px;}</style>
</head>
<body>
<h2>Ledger Report</h2>
<table>
<thead><tr><th>Party</th><th>Ref</th><th>Date</th><th>In</th><th>Out</th></tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
<p class="total">Total Received: ${formatAmount(totalIn)}</p>
<p class="total">Total Paid: ${formatAmount(totalOut)}</p>
</body>
</html>`;
}

function buildLedgerWorkbook(rows: LedgerRow[], totalIn: number, totalOut: number): XLSX.WorkBook {
  const sheetRows: (string | number)[][] = [
    ['Party', 'Description', 'Trip/Ref', 'Date', 'Amount In', 'Amount Out'],
    ...rows.map((r) => [
      r.party_name ?? '',
      r.description ?? '',
      r.trip_number ?? '',
      (r.transaction_date ?? '').slice(0, 10),
      r.amount_in ?? 0,
      r.amount_out ?? 0,
    ]),
    [],
    ['Total Received', '', '', '', totalIn, ''],
    ['Total Paid', '', '', '', '', totalOut],
  ];
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

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface LedgerReportModalProps {
  visible: boolean;
  onClose: () => void;
  transactions: LedgerRow[];
  /** Optional title override */
  title?: string;
  /** When true, hides Cash In / Cash Out summary (e.g. custom shared-ledger export). */
  hideCashSummary?: boolean;
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
  customReport,
}: LedgerReportModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
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
  const plainText = ledgerToPlainText(sortedTransactions, totalIn, totalOut);
  const csv = ledgerToCsv(sortedTransactions);
  const html = ledgerToHtml(sortedTransactions, totalIn, totalOut);
  const isCustomReport = !!customReport;
  const activePlainText = useMemo(() => {
    if (!customReport) return plainText;
    const header = customReport.columns.map((c) => c.label).join(' | ');
    const lines = customReport.rows.map((row) =>
      customReport.columns.map((c) => String(row[c.key] ?? '—').replace(/\|/g, ' ')).join(' | ')
    );
    return [displayTitle.toUpperCase(), '—', header, ...lines].join('\n');
  }, [customReport, plainText, displayTitle]);
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
    const isWide = customReport.columns.length > 8;
    const columnClass = (key: string) => `col-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const th = customReport.columns
      .map((col) => `<th class="${columnClass(col.key)}" style="text-align:${col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left'};">${escapeHtml(col.label)}</th>`)
      .join('');
    const tr = customReport.rows
      .map((row) => `<tr>${customReport.columns.map((col) => {
        const align = col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left';
        const value = row[col.key] == null ? '—' : String(row[col.key]);
        return `<td class="${columnClass(col.key)}" style="text-align:${align};">${escapeHtml(value)}</td>`;
      }).join('')}</tr>`)
      .join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(displayTitle)}</title><style>
      @page { size: ${isWide ? 'A4 landscape' : 'A4 portrait'}; margin: 10mm; }
      body{font-family:system-ui;padding:8px;font-size:10px;color:#0f172a;}
      h2{margin:0 0 10px 0;font-size:14px;}
      table{width:100%;border-collapse:collapse;table-layout:fixed;}
      th,td{border:1px solid #dbe2ea;padding:6px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      th{background:#0f172a;color:#fff;text-transform:uppercase;font-size:8px;letter-spacing:.4px;}
      tr:nth-child(even) td{background:#f8fafc;}
      .col-trip{width:90px}.col-route{width:170px}.col-model{width:90px}.col-supplier{width:150px}.col-client{width:130px}
      .col-sales,.col-cost,.col-pnl,.col-margin,.col-received,.col-due,.col-txns,.col-lastTxn,.col-contract,.col-clientRevenue,.col-paid{width:80px}
    </style></head><body><h2>${escapeHtml(displayTitle)}</h2><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
  }, [customReport, html, displayTitle]);

  const getCustomColumnWidth = (key: string): number => {
    switch (key) {
      case 'trip': return 90;
      case 'route': return 190;
      case 'model': return 90;
      case 'supplier': return 160;
      case 'client': return 140;
      case 'mission': return 88;
      case 'status': return 96;
      case 'partnerNote': return 120;
      case 'mySales':
      case 'themSales':
      case 'myReceived':
      case 'themReceived':
      case 'due':
        return 86;
      case 'txns': return 44;
      case 'lastTxn': return 72;
      case 'sync': return 52;
      case 'you':
      case 'partner':
        return 80;
      case 'refs': return 140;
      case 'date': return 88;
      default: return 90;
    }
  };

  const getCustomValueColor = (key: string, value: string): string | undefined => {
    const v = value.trim();
    const isDashOrZero = v === '—' || v === '₹0' || v === '0' || v === '0.0%';
    if (key === 'sync') return v === 'Fix' ? Theme.teslaRed : Theme.darkGreen;
    if (key === 'due') return isDashOrZero ? Theme.textPrimary : Theme.teslaRed;
    if (key === 'pnl' || key === 'margin' || key === 'received' || key === 'paid') {
      return v.startsWith('-') ? Theme.teslaRed : Theme.darkGreen;
    }
    return undefined;
  };

  const handlePrint = async () => {
    try {
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
        await Print.printAsync({ html: activeHtml });
        if (mode === 'share') {
          Alert.alert('Share PDF', 'Use your browser print dialog to save/share the PDF.');
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
    try {
      if (Platform.OS === 'web') {
        const workbook = isCustomReport
          ? (() => {
              const ws = XLSX.utils.aoa_to_sheet([
                customReport!.columns.map((c) => c.label),
                ...customReport!.rows.map((row) => customReport!.columns.map((c) => row[c.key] ?? '')),
              ]);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Report');
              return wb;
            })()
          : buildLedgerWorkbook(sortedTransactions, totalIn, totalOut);
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
            const ws = XLSX.utils.aoa_to_sheet([
              customReport!.columns.map((c) => c.label),
              ...customReport!.rows.map((row) => customReport!.columns.map((c) => row[c.key] ?? '')),
            ]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            return wb;
          })()
        : buildLedgerWorkbook(sortedTransactions, totalIn, totalOut);
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
    setFormatPickerVisible(false);
    void handlePdfAction(formatPickerMode);
  };

  const handleSelectExcel = () => {
    setFormatPickerVisible(false);
    void handleExcelAction(formatPickerMode);
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
          <View style={[styles.header, { paddingTop: 16 + insets.top }]}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>{displayTitle}</Text>
              <Text style={styles.previewSubtitle}>Report preview</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <FontAwesome name="times" size={18} color={Theme.textPrimary} />
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
            </View>
          ) : null}

          <View style={styles.tableHeader}>
            {isCustomReport ? (
              customReport!.columns.map((col) => (
                <Text
                  key={col.key}
                  style={[
                    styles.th,
                    styles.thCustom,
                    col.align === 'right' ? styles.thNum : undefined,
                    { width: getCustomColumnWidth(col.key), textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left' },
                  ]}
                  numberOfLines={1}
                >
                  {col.label}
                </Text>
              ))
            ) : (
              <>
                <Text style={[styles.th, styles.thEntity]}>PARTY / DESC</Text>
                <Text style={[styles.th, styles.thDate]}>DATE</Text>
                <Text style={[styles.th, styles.thNum]}>{t("cashIn")}</Text>
                <Text style={[styles.th, styles.thNum]}>{t("cashOut")}</Text>
              </>
            )}
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              (isCustomReport ? customReport!.rows.length === 0 : sortedTransactions.length === 0) && styles.listContentEmpty,
            ]}
            showsVerticalScrollIndicator={true}
          >
            {(isCustomReport ? customReport!.rows.length === 0 : sortedTransactions.length === 0) ? (
              <Text style={styles.empty}>{t("noLedgerEntries")}</Text>
            ) : (
              isCustomReport
                ? customReport!.rows.map((row, idx) => (
                    <View key={`custom-row-${idx}`} style={styles.row}>
                      {customReport!.columns.map((col) => (
                        <Text
                          key={`${idx}-${col.key}`}
                          style={[
                            styles.cellCustom,
                            col.align === 'right' ? styles.cellNum : undefined,
                            {
                              width: getCustomColumnWidth(col.key),
                              textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
                              color: getCustomValueColor(col.key, row[col.key] == null ? '—' : String(row[col.key])) ?? Theme.textPrimary,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {row[col.key] == null ? '—' : String(row[col.key])}
                        </Text>
                      ))}
                    </View>
                  ))
                : sortedTransactions.map((row) => (
                <View key={row.id} style={styles.row}>
                  <View style={styles.cellEntity}>
                    <Text style={styles.entityName} numberOfLines={1}>{row.party_name}</Text>
                    <Text style={styles.entityDesc} numberOfLines={1}>
                      {getOperationalRef(row)}
                    </Text>
                  </View>
                  <Text style={styles.cellDate}>{formatDate(row.transaction_date)}</Text>
                  <Text style={[styles.cellNum, styles.positive]}>
                    {(row.amount_in ?? 0) > 0 ? formatAmount(row.amount_in!) : '—'}
                  </Text>
                  <Text style={[styles.cellNum, styles.negative]}>
                    {(row.amount_out ?? 0) > 0 ? formatAmount(row.amount_out!) : '—'}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={[styles.actionBar, { paddingBottom: 12 + insets.bottom, paddingTop: 16 }]}>
            <TouchableOpacity style={styles.actionBtn} onPress={handlePrint}>
              <FontAwesome name="print" size={16} color={Theme.textPrimary} />
              <Text style={styles.actionBtnText}>Print</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleWhatsApp}>
              <FontAwesome name="whatsapp" size={16} color={Theme.textPrimary} />
              <Text style={styles.actionBtnText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
              <FontAwesome name="share-alt" size={16} color={Theme.textPrimary} />
              <Text style={styles.actionBtnText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, downloadInProgress && styles.actionBtnDisabled]}
              onPress={handleDownload}
              disabled={downloadInProgress}
            >
              {downloadInProgress ? (
                <LoadingIndicator size="small" color={Theme.textPrimary} />
              ) : (
                <FontAwesome name="download" size={16} color={Theme.textPrimary} />
              )}
              <Text style={styles.actionBtnText}>{downloadInProgress ? 'Generating…' : 'Download'}</Text>
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
        <TouchableOpacity
          style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          activeOpacity={1}
          onPress={() => setFormatPickerVisible(false)}
        >
          <View style={styles.downloadModalCard}>
            <Text style={styles.downloadModalTitle}>
              {formatPickerMode === 'share' ? 'Share format' : 'Download format'}
            </Text>
            <Text style={styles.downloadModalSubtitle}>
              {formatPickerMode === 'share'
                ? 'Choose file format to share'
                : 'Choose your preferred report file type'}
            </Text>
            <TouchableOpacity style={styles.downloadOption} onPress={handleSelectPdf} activeOpacity={0.8}>
              <Text style={styles.downloadOptionText}>
                {formatPickerMode === 'share' ? 'Share as PDF' : 'Download PDF'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.downloadOption} onPress={handleSelectExcel} activeOpacity={0.8}>
              <Text style={styles.downloadOptionText}>
                {formatPickerMode === 'share' ? 'Share as Excel (.xlsx)' : 'Download Excel (.xlsx)'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.downloadOption, styles.downloadCancelOption]}
              onPress={() => setFormatPickerVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.downloadOptionText, styles.downloadCancelOptionText]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
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
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  headerTitleRow: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.textPrimary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  previewSubtitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 2,
    textTransform: 'none',
  },
  closeBtn: {
    padding: 8,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 20,
  },
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Theme.textPrimary,
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  summaryCell: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  positive: { color: Theme.darkGreen },
  negative: { color: Theme.teslaRed },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.surfaceBorder,
  },
  th: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  thEntity: { flex: 1 },
  thCustom: { flex: 1, fontSize: 8 },
  thDate: { width: 72 },
  thNum: { width: 64, textAlign: 'right' },
  list: {
    flex: 1,
    minHeight: 120,
    backgroundColor: Theme.screenBackground,
  },
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  cellEntity: { flex: 1 },
  entityName: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  entityDesc: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 4,
  },
  cellDate: {
    width: 72,
    fontSize: 11,
    color: Theme.textSecondary,
  },
  cellNum: {
    width: 64,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  cellCustom: {
    flex: 1,
    fontSize: 10,
    color: Theme.textPrimary,
    paddingRight: 8,
  },
  empty: {
    padding: 24,
    textAlign: 'center',
    fontSize: 12,
    color: Theme.textSecondary,
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
