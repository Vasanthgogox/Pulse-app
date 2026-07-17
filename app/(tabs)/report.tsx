import { useState } from 'react';
import {
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  View,
  Share,
  useWindowDimensions,
  Platform,
  Pressable,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailScreenLayout } from '@/components/DetailScreenLayout';
import { TransactionRow } from '@/components/TransactionRow';
import { formatINR } from '@/lib/format';
import Theme from '@/constants/Theme';
import { wrapPrintableReportHtml } from '@/lib/reportWatermark.util';
import { printHtmlOnWeb } from '@/lib/webPrint.util';

// Sample transaction data - replace with actual data from your service
const sampleTransactions = [
  { id: '1', name: 'idrees', dateTime: '29 Dec 25 • 05:11 PM', amount: '₹50,000', color: 'green' as const },
  { id: '2', name: 'idrees', dateTime: '29 Dec 25 • 05:11 PM', amount: '₹75,000', color: 'red' as const },
  { id: '3', name: 'idrees', dateTime: '29 Dec 25 • 05:09 PM', amount: '₹25,000', color: 'red' as const },
  { id: '4', name: 'Sadam', dateTime: '29 Dec 25 • 04:56 PM', amount: '₹25,000', color: 'red' as const },
];

function formatReportDate(d: Date): string {
  const day = d.getDate();
  const mon = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[d.getMonth()];
  const yy = String(d.getFullYear()).slice(2);
  return `${day} ${mon} ${yy}`;
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

const DATE_PRESETS = [
  { label: 'Today', getRange: () => { const d = new Date(); return { start: d, end: d }; } },
  { label: 'Last 7 days', getRange: () => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 6); return { start, end }; } },
  { label: 'Last 30 days', getRange: () => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29); return { start, end }; } },
];

const FILTER_OPTIONS = [
  { value: 'All', label: 'All' },
  { value: 'You gave', label: 'You gave' },
  { value: 'You got', label: 'You got' },
];

export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [startDate, setStartDate] = useState(formatReportDate(new Date()));
  const [endDate, setEndDate] = useState(formatReportDate(new Date()));
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [dateModalTarget, setDateModalTarget] = useState<'start' | 'end' | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);

  const applyDatePreset = (preset: (typeof DATE_PRESETS)[0]) => {
    const { start, end } = preset.getRange();
    setStartDate(formatReportDate(start));
    setEndDate(formatReportDate(end));
    setDateModalVisible(false);
    setDateModalTarget(null);
  };

  const openDateModal = (target: 'start' | 'end') => {
    setDateModalTarget(target);
    setDateModalVisible(true);
  };

  // Calculate totals (using numeric values for calculations)
  const youGaveTotal = sampleTransactions
    .filter((t) => t.color === 'red')
    .reduce((sum, t) => sum + parseInt(t.amount.replace(/[₹,]/g, '')), 0);
  const youGotTotal = sampleTransactions
    .filter((t) => t.color === 'green')
    .reduce((sum, t) => sum + parseInt(t.amount.replace(/[₹,]/g, '')), 0);
  const netBalance = youGotTotal - youGaveTotal;

  let list = search
    ? sampleTransactions.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : sampleTransactions;
  if (filter === 'You gave') list = list.filter((t) => t.color === 'red');
  if (filter === 'You got') list = list.filter((t) => t.color === 'green');
  const filteredTransactions = list;

  const buildReportMessage = () => {
    const lines = [
      `Report ${startDate} – ${endDate}`,
      `Net balance: ${formatINR(netBalance)}`,
      `You gave: ${formatINR(youGaveTotal)}`,
      `You got: ${formatINR(youGotTotal)}`,
      '',
      ...filteredTransactions.map((t) => `${t.dateTime} • ${t.name} • ${t.amount}`),
    ];
    return lines.join('\n');
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: buildReportMessage(), title: 'View Report' });
    } catch {
      /* user cancelled */
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const html = wrapPrintableReportHtml({
        title: `Report ${startDate} - ${endDate}`,
        bodyHtml: `<h2>Report ${startDate} - ${endDate}</h2><pre>${buildReportMessage().replace(/</g, "&lt;")}</pre>`,
      });
      if (Platform.OS === 'web') {
        const ok = await printHtmlOnWeb(html, { title: `Report ${startDate} - ${endDate}` });
        if (!ok) {
          await Share.share({ message: buildReportMessage(), title: 'Report' });
        }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or share report PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Share.share({ url: uri, title: 'Report' });
      }
    } catch {
      /* user cancelled */
    }
  };

  const handleDownload = () => {
    setDownloadModalVisible(true);
  };

  const handleDownloadCsv = async () => {
    const csv = [
      'Date/Time,Name,Amount,Type',
      ...filteredTransactions.map((t) =>
        `"${t.dateTime}","${t.name}","${t.amount}","${t.color === 'green' ? 'In' : 'Out'}"`
      ),
    ].join('\n');
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        triggerWebDownload(blob, `report-${Date.now()}.csv`);
        return;
      }
      await Share.share({ message: csv, title: 'Report.csv' });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <>
      <DetailScreenLayout
        title="View Report"
        startDate={startDate}
        endDate={endDate}
        onStartDatePress={() => openDateModal('start')}
        onEndDatePress={() => openDateModal('end')}
        searchPlaceholder="Search Entries"
        searchValue={search}
        onSearchChange={setSearch}
        filterValue={filter}
        onFilterPress={() => setFilterModalVisible(true)}
        netBalance={formatINR(netBalance)}
        netBalanceColor={netBalance >= 0 ? 'green' : 'red'}
        entriesLabel="ENTRIES"
        entriesCount={`${filteredTransactions.length} Entries`}
        youGaveLabel="YOU GAVE"
        youGaveAmount={formatINR(youGaveTotal)}
        youGotLabel="YOU GOT"
        youGotAmount={formatINR(youGotTotal)}
        onDownloadPress={handleDownload}
        onSharePress={handleShare}
      >
      {filteredTransactions.length === 0 ? (
        <Text style={styles.empty}>No transactions found.</Text>
      ) : (
        filteredTransactions.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            name={transaction.name}
            dateTime={transaction.dateTime}
            amount={transaction.amount}
            amountColor={transaction.color}
          />
        ))
      )}
      </DetailScreenLayout>

      <Modal
        visible={dateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateModalVisible(false)}
      >
        <TouchableOpacity
          style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          activeOpacity={1}
          onPress={() => setDateModalVisible(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {dateModalTarget === 'start' ? 'Start date' : dateModalTarget === 'end' ? 'End date' : 'Date range'}
            </Text>
            {DATE_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.label}
                style={styles.modalOption}
                onPress={() => applyDatePreset(preset)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalOptionText}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={downloadModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDownloadModalVisible(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          onPress={() => setDownloadModalVisible(false)}
        >
          <Pressable
            style={[styles.downloadModalCard, { maxWidth: width * 0.85 }]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.downloadModalTitle}>Download format</Text>
            <Text style={styles.downloadModalSubtitle}>Choose your preferred report file type</Text>
            <View style={styles.downloadFormatRow}>
              <TouchableOpacity
                style={styles.downloadFormatTile}
                onPress={() => {
                  setDownloadModalVisible(false);
                  void handleDownloadPdf();
                }}
                activeOpacity={0.85}
              >
                <FontAwesome name="file-pdf-o" size={22} color={Theme.teslaRed} />
                <Text style={styles.downloadFormatTileTitle}>PDF</Text>
                <Text style={styles.downloadFormatTileHint}>Download PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.downloadFormatTile}
                onPress={() => {
                  setDownloadModalVisible(false);
                  void handleDownloadCsv();
                }}
                activeOpacity={0.85}
              >
                <FontAwesome name="file-excel-o" size={22} color={Theme.darkGreen} />
                <Text style={styles.downloadFormatTileTitle}>CSV</Text>
                <Text style={styles.downloadFormatTileHint}>Spreadsheet</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.downloadOption, styles.downloadCancelOption]}
              onPress={() => setDownloadModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.downloadOptionText, styles.downloadCancelOptionText]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={[styles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          activeOpacity={1}
          onPress={() => setFilterModalVisible(false)}
        >
          <View style={[styles.modalCard, { maxWidth: width * 0.85 }]}>
            <Text style={styles.modalTitle}>Filter</Text>
            {FILTER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.modalOption}
                onPress={() => {
                  setFilter(opt.value);
                  setFilterModalVisible(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalOptionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    padding: 24,
    textAlign: 'center',
    color: Theme.textMuted,
    fontSize: 16,
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

