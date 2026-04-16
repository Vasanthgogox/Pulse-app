/**
 * Ledger report preview: table of transactions with Print, Share (WhatsApp), and Download.
 * Shown when user taps Report icon on Treasury or entity detail.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Share, Alert, Linking, ActivityIndicator, Platform } from 'react-native';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import { useLanguage } from '@/contexts/LanguageContext';
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
        escape(r.trip_number ?? ''),
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
        (r.trip_number || r.description || '—').replace(/\|/g, ' '),
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
        `<tr><td>${escapeHtml(r.party_name ?? '')}</td><td>${escapeHtml(r.trip_number || r.description || '—')}</td><td>${(r.transaction_date ?? '').slice(0, 10)}</td><td>${(r.amount_in ?? 0) > 0 ? formatAmount(r.amount_in!) : '—'}</td><td>${(r.amount_out ?? 0) > 0 ? formatAmount(r.amount_out!) : '—'}</td></tr>`
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
}

export function LedgerReportModal({
  visible,
  onClose,
  transactions,
  title,
}: LedgerReportModalProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [downloadInProgress, setDownloadInProgress] = useState(false);
  const [formatPickerVisible, setFormatPickerVisible] = useState(false);
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

  const handlePrint = async () => {
    try {
      await Print.printAsync({ html });
    } catch {
      Share.share({
        message: plainText,
        title: 'Ledger Report – Print or Save',
      }).catch(() => Alert.alert('Print', 'Use Share or Download to print from another app.'));
    }
  };

  const handleWhatsApp = () => {
    const url = `whatsapp://send?text=${encodeURIComponent(plainText)}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Share.share({ message: plainText, title: 'Ledger Report' }).catch(() => {});
    }).catch(() => Share.share({ message: plainText, title: 'Ledger Report' }).catch(() => {}));
  };

  const handleShare = () => {
    Share.share({
      message: plainText,
      title: 'Ledger Report',
    }).catch(() => Alert.alert('Share', 'Sharing is not available.'));
  };

  const handleDownloadPdf = async () => {
    if (downloadInProgress) return;
    setDownloadInProgress(true);
    try {
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
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
    } catch (e) {
      try {
        await Share.share({
          message: csv,
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

  const handleDownloadExcel = async () => {
    if (downloadInProgress) return;
    setDownloadInProgress(true);
    try {
      if (Platform.OS === 'web') {
        const workbook = buildLedgerWorkbook(sortedTransactions, totalIn, totalOut);
        const arrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob(
          [arrayBuffer],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        );
        triggerWebDownload(blob, `ledger-report-${Date.now()}.xlsx`);
        return;
      }
      if (!FileSystem.cacheDirectory) throw new Error('No cache directory available');
      const workbook = buildLedgerWorkbook(sortedTransactions, totalIn, totalOut);
      const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const uri = `${FileSystem.cacheDirectory}ledger-report-${Date.now()}.xlsx`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
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
          message: csv,
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
    setFormatPickerVisible(true);
  };

  const handleSelectPdf = () => {
    setFormatPickerVisible(false);
    void handleDownloadPdf();
  };

  const handleSelectExcel = () => {
    setFormatPickerVisible(false);
    void handleDownloadExcel();
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

          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thEntity]}>PARTY / DESC</Text>
            <Text style={[styles.th, styles.thDate]}>DATE</Text>
            <Text style={[styles.th, styles.thNum]}>{t("cashIn")}</Text>
            <Text style={[styles.th, styles.thNum]}>{t("cashOut")}</Text>
          </View>

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
              sortedTransactions.map((row) => (
                <View key={row.id} style={styles.row}>
                  <View style={styles.cellEntity}>
                    <Text style={styles.entityName} numberOfLines={1}>{row.party_name}</Text>
                    <Text style={styles.entityDesc} numberOfLines={1}>
                      {row.trip_number || row.description || '—'}
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
                <ActivityIndicator size="small" color={Theme.textPrimary} />
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
            <Text style={styles.downloadModalTitle}>Download format</Text>
            <Text style={styles.downloadModalSubtitle}>Choose your preferred report file type</Text>
            <TouchableOpacity style={styles.downloadOption} onPress={handleSelectPdf} activeOpacity={0.8}>
              <Text style={styles.downloadOptionText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.downloadOption} onPress={handleSelectExcel} activeOpacity={0.8}>
              <Text style={styles.downloadOptionText}>Excel (.xlsx)</Text>
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
