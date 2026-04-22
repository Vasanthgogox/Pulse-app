import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import Typography from '@/constants/Typography';
import {
  driverBodyPrimary,
  driverBodySecondary,
  driverUISemiBold,
} from '@/constants/DriverTypography';
import { SearchBar } from '@/components/SearchBar';
import { ThemedConfirmModal } from '@/components/ThemedConfirmModal';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAvatar } from '@/contexts/DriverAvatarContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useDriverAvatarUri } from '@/lib/avatarUpload';
import { getFleetAvatarUriForOrg } from '@/lib/fleetAvatar';
import {
  buildBulkTripClaimWhatsappMessage,
  buildSettlementShareMessage,
  buildTripClaimWhatsappMessage,
} from '@/lib/driverCommunication';
import {
  phonePeMetaDate
} from '@/lib/driverGpayTransactions';
import { isAggregateTrip, tripEarningsForDriver } from '@/lib/driverUtils';
import { usePreventScreenCapture } from '@/lib/usePreventScreenCapture';
import * as driversService from '@/services/driversService';
import * as salaryRequestsService from '@/services/salaryRequestsService';
import * as tripsService from '@/services/tripsService';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles, Wallet } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const isAndroid = Platform.OS === 'android';

function isCompleted(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'delivered' || s === 'done';
}

/** Trip earnings for driver: 0 for aggregate (offline payment), else driver_commission / 10% supplier_rate / 10% client_price. */
function tripEarnings(t: tripsService.TripRow): number {
  return tripEarningsForDriver(t);
}

/** UPI-style date section label: Today, Yesterday, or "5 Mar" */
function formatTransactionDateSection(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dDate = d.getDate();
  const dMonth = d.getMonth();
  const dYear = d.getFullYear();
  if (dDate === today.getDate() && dMonth === today.getMonth() && dYear === today.getFullYear())
    return 'Today';
  if (dDate === yesterday.getDate() && dMonth === yesterday.getMonth() && dYear === yesterday.getFullYear())
    return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const DRIVER_LEDGER_TYPE_LABELS: Record<string, string> = {
  salary: 'Monthly salary',
  settlement: 'Trip-based',
  advance: 'Advance',
  reimbursement: 'Reimbursement',
  adjustment: 'Adjustment',
  deduction: 'Deduction',
};

function ledgerTypeLabel(type: string): string {
  return DRIVER_LEDGER_TYPE_LABELS[type] ?? type;
}

/** Wallet card + credits — deeper emerald palette (aligned with Theme.driver*) */
const EMERALD_950 = '#022c22';
const EMERALD_900 = '#064e3b';
const EMERALD_700 = '#047857';
const EMERALD_600 = '#059669';
const EMERALD_500 = '#047857'; /* credits hero / accents */
const EMERALD_400 = '#059669'; /* watermark, secondary accent */
const EMERALD_200_90 = 'rgba(167,243,208,0.88)'; /* card label on dark emerald */
const GRAY_700 = '#374151';      /* gray-700: credits subtitle (dark grey) */
const AMBER_50 = 'rgba(245,158,11,0.12)';   /* pending badge bg */
const AMBER_600 = '#d97706';     /* pending badge text */
const EMERALD_50 = 'rgba(4,120,87,0.14)'; /* received badge bg */

export default function DriverWalletScreen() {
  usePreventScreenCapture();
  const insets = useSafeAreaInsets();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === 'dark';
  const router = useRouter();

  // Note: We intentionally do not deep-link to the Trip tab from Wallet.
  // The Wallet screen should remain self-contained and not steal focus/navigation.
  const { profile } = useAuth();
  const { avatarSeed } = useDriverAvatar();
  const { avatarUri } = useDriverAvatarUri();
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<driversService.DriverLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'pending' | 'received'>('all');
  /** Expand/collapse transaction detail (trip id or null). No redirect. */
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [expandedTripReceiptId, setExpandedTripReceiptId] = useState<string | null>(null);
  const [markPaidLoadingTripId, setMarkPaidLoadingTripId] = useState<string | null>(null);
  const [requestPaymentLoadingTripId, setRequestPaymentLoadingTripId] = useState<string | null>(null);
  const [claimAllLoading, setClaimAllLoading] = useState(false);

  const [mainTab, setMainTab] = useState<'trips' | 'cash' | 'fleet'>('trips');
  const [journeySearch, setJourneySearch] = useState('');
  const [journeyFilter, setJourneyFilter] = useState<'all' | 'pending' | 'fleet_marked' | 'settled'>('all');
  const [copiedTripId, setCopiedTripId] = useState<string | null>(null);
  const [markPaidConfirmState, setMarkPaidConfirmState] = useState<{
    trip: tripsService.TripRow;
    amount: number;
    sourceLedger?: driversService.DriverLedgerRow | null;
  } | null>(null);

  const openWhatsAppReminder = useCallback(async (message: string) => {
    const encoded = encodeURIComponent(message);
    const waWeb = `https://wa.me/?text=${encoded}`;
    const waNative = `whatsapp://send?text=${encoded}`;
    try {
      if (Platform.OS !== 'web') {
        const can = await Linking.canOpenURL(waNative);
        await Linking.openURL(can ? waNative : waWeb);
      } else {
        await Linking.openURL(waWeb);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleCopyTripId = useCallback((tripId: string) => {
    Clipboard.setStringAsync(tripId)
      .then(() => {
        setCopiedTripId(tripId);
        setTimeout(() => setCopiedTripId(null), 2000);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);
    Promise.all([
      driversService.getLinkedDriversForCurrentUser(profile.uid),
      driversService.getDriverInvitesReceived(),
    ]).then(([driversRes, invRes]) => {
      const drivers = (driversRes.drivers ?? []).filter((d) => !d.left_at);
      setInvites(invRes.invites ?? []);
      setLinkedDrivers(drivers);
      if (drivers.length > 0) {
        setDriver(drivers[0]);
        const driverIds = drivers.map((d) => d.id);
        Promise.all([
          tripsService.getTripsByDriverIds(driverIds),
          driversService.getDriverLedgerByDriverIds(driverIds),
        ]).then(([tRes, ledgerRes]) => {
          setTrips(tRes.trips ?? []);
          setLedgerEntries(ledgerRes.entries ?? []);
          setLoading(false);
          initialLoadDoneRef.current = true;
          isRefreshingRef.current = false;
          setRefreshing(false);
        });
      } else {
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      }
    }).catch(() => {
      setLoading(false);
      initialLoadDoneRef.current = true;
      isRefreshingRef.current = false;
      setRefreshing(false);
    });
  }, [profile?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const completedTrips = useMemo(() => {
    const list = trips.filter((t) => isCompleted(t.status));
    return [...list].sort((a, b) => {
      const da = new Date(a.completed_at ?? a.updated_at ?? a.created_at).getTime();
      const db = new Date(b.completed_at ?? b.updated_at ?? b.created_at).getTime();
      return db - da;
    });
  }, [trips]);

  /** O(n): one pass over ledgerEntries → settlement totals per trip_id + non-trip entries. */
  const { receivedByTripId, nonTripLedgerEntries } = useMemo(() => {
    const byTrip: Record<string, number> = {};
    const nonTrip: driversService.DriverLedgerRow[] = [];
    for (let i = 0; i < ledgerEntries.length; i++) {
      const e = ledgerEntries[i];
      const amt = Number(e.amount) || 0;
      const tid = e.trip_id?.trim() || null;
      if (tid) {
        // Only verified trip settlements count as "received" in the driver app.
        if (e.type === 'settlement') {
          byTrip[tid] = (byTrip[tid] ?? 0) + amt;
        }
      } else {
        nonTrip.push(e);
      }
    }
    return { receivedByTripId: byTrip, nonTripLedgerEntries: nonTrip };
  }, [ledgerEntries]);

  const sortedLedgerEntries = useMemo(() => {
    return [...ledgerEntries].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [ledgerEntries]);

  const receivedLedgerEntries = useMemo(() => {
    // Settlement credits only (used for "received"/"settled" UI).
    return sortedLedgerEntries.filter((entry) => entry.type === 'settlement' && (Number(entry.amount) || 0) > 0);
  }, [sortedLedgerEntries]);

  const latestCreditLedgerByTripId = useMemo(() => {
    const byTrip: Record<string, driversService.DriverLedgerRow> = {};
    for (let i = 0; i < receivedLedgerEntries.length; i++) {
      const e = receivedLedgerEntries[i];
      const tid = e.trip_id?.trim() || '';
      if (!tid) continue;
      const prev = byTrip[tid];
      if (!prev) {
        byTrip[tid] = e;
        continue;
      }
      const prevT = new Date(prev.created_at).getTime();
      const nextT = new Date(e.created_at).getTime();
      if (nextT > prevT) byTrip[tid] = e;
    }
    return byTrip;
  }, [receivedLedgerEntries]);

  const hasFleetPaidPendingToken = useCallback((raw?: string | null) => {
    const s = (raw ?? '').trim();
    if (!s) return false;
    // Token appended by fleet-side ledger-sync for "pending verification" entries.
    return /Sync\s*:\s*FLEET_PAID_PENDING/i.test(s);
  }, []);

  const isLegacyFleetPendingEvidence = useCallback((raw?: string | null) => {
    const s = (raw ?? '').trim();
    if (!s) return false;
    // Backward-compatibility for existing DB rows created before the explicit sync token rollout.
    // These rows typically still carry payment metadata or trip-commission wording.
    return /(\bUTR\b|\bMode\s*:|\bTrip\s*Commission\b|\bTrip\s*Payment\b|\bSettlement\b)/i.test(s);
  }, []);

  const latestFleetPaidPendingLedgerByTripId = useMemo(() => {
    const byTrip: Record<string, driversService.DriverLedgerRow> = {};
    for (let i = 0; i < ledgerEntries.length; i++) {
      const e = ledgerEntries[i];
      const tid = e.trip_id?.trim() || null;
      if (!tid) continue;
      if (e.type === 'settlement') continue; // settlement entries are already "received"
      const amt = Number(e.amount) || 0;
      if (amt <= 0) continue;
      const desc = e.description;
      if (!hasFleetPaidPendingToken(desc) && !isLegacyFleetPendingEvidence(desc)) continue;
      const prev = byTrip[tid];
      const prevT = prev?.created_at ? new Date(prev.created_at).getTime() : 0;
      const nextT = e.created_at ? new Date(e.created_at).getTime() : 0;
      if (!prev || nextT > prevT) byTrip[tid] = e;
    }
    return byTrip;
  }, [ledgerEntries, hasFleetPaidPendingToken, isLegacyFleetPendingEvidence]);

  const extractUtr = useCallback((raw?: string | null) => {
    const s = (raw ?? '').trim();
    if (!s) return null;
    // Common formats: "UTR: 61229011223", "UTR 61229011223", "utr=61229011223"
    const m = s.match(/\bUTR\b\s*[:=]?\s*([0-9A-Za-z-]{8,24})\b/i);
    return m?.[1] ?? null;
  }, []);

  const derivePaymentMode = useCallback((raw?: string | null) => {
    const s = (raw ?? '').toLowerCase();
    if (!s) return null;
    if (s.includes('upi')) return 'UPI';
    if (s.includes('bank') || s.includes('neft') || s.includes('rtgs') || s.includes('imps')) return 'BANK TRANSFER';
    if (s.includes('cash')) return 'CASH';
    return null;
  }, []);

  const buildCashReceiptHtml = useCallback((p: {
    title: string;
    amount: number;
    transactionId: string;
    utr: string;
    paymentMode: string;
    capturedAt: string;
    reference: string;
    settledTo: string;
    route?: string | null;
  }) => {
    const {
      title,
      amount,
      transactionId,
      utr,
      paymentMode,
      capturedAt,
      reference,
      settledTo,
      route,
    } = p;
    const safe = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial; margin: 0; color: #0f172a; }
      .page { padding: 24px; }
      .card { border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden; }
      .hero { padding: 28px 22px 20px; text-align: center; background: #f8fafc; }
      .check { width: 64px; height: 64px; border-radius: 999px; background: #dcfce7; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px; }
      .check svg { width: 30px; height: 30px; color: #16a34a; }
      .eyebrow { font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: #16a34a; margin-bottom: 10px; }
      .amount { font-size: 44px; font-weight: 700; letter-spacing: -0.04em; margin: 0; }
      .divider { border-top: 1px dashed #e2e8f0; }
      .rows { padding: 18px 18px 10px; }
      .row { display: flex; justify-content: space-between; gap: 14px; padding: 10px 0; }
      .k { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #64748b; min-width: 120px; }
      .v { font-size: 14px; font-weight: 600; color: #0f172a; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .footer { padding: 16px 18px 18px; font-size: 11px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="card">
        <div class="hero">
          <div class="check" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="eyebrow">${safe(title)}</div>
          <p class="amount">₹${Math.round(amount).toLocaleString('en-IN')}</p>
        </div>
        <div class="divider"></div>
        <div class="rows">
          <div class="row"><div class="k">Transaction ID</div><div class="v">${safe(transactionId)}</div></div>
          <div class="row"><div class="k">UTR</div><div class="v">${safe(utr)}</div></div>
          <div class="row"><div class="k">Payment mode</div><div class="v">${safe(paymentMode)}</div></div>
          <div class="row"><div class="k">Captured at</div><div class="v">${safe(capturedAt)}</div></div>
          <div class="row"><div class="k">Reference</div><div class="v">${safe(reference)}</div></div>
          <div class="row"><div class="k">Settled to</div><div class="v">${safe(settledTo)}</div></div>
          ${route ? `<div class="row"><div class="k">Route</div><div class="v">${safe(route)}</div></div>` : ``}
        </div>
        <div class="footer">Generated from Q Driver · ${safe(capturedAt)}</div>
      </div>
    </div>
  </body>
</html>`;
  }, []);

  const shareCashReceiptPdf = useCallback(
    async (p: {
      title: string;
      amount: number;
      transactionId: string;
      utr: string;
      paymentMode: string;
      capturedAt: string;
      reference: string;
      settledTo: string;
      route?: string | null;
    }) => {
      const html = buildCashReceiptHtml(p);
      const file = await Print.printToFileAsync({ html });
      if (Platform.OS === 'web') {
        // Best-effort: open the generated file in a new tab.
        window.open(file.uri, '_blank');
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Share unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share receipt',
        UTI: 'com.adobe.pdf',
      });
    },
    [buildCashReceiptHtml],
  );

  const buildTripClaimHtml = useCallback((p: {
    fleetName: string;
    displayId: string;
    amount: number;
    from: string;
    to: string;
    status: string;
    capturedAt: string;
    driverName?: string | null;
    driverPhone?: string | null;
    tripDate?: string | null;
    /** DB salary_request id — printed on PDF for fleet reconciliation */
    paymentRequestId?: string | null;
  }) => {
    const safe = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    const driverLine = [p.driverName?.trim() || null, p.driverPhone?.trim() || null].filter(Boolean).join(' · ');
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial; margin: 0; color: #0f172a; background: #ffffff; }
      .page { padding: 24px; }
      .card { border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden; }
      .hero { padding: 22px; background: #0b1220; color: #ffffff; }
      .eyebrow { font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: rgba(255,255,255,0.65); margin-bottom: 10px; }
      .title { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 8px; }
      .sub { font-size: 12px; color: rgba(255,255,255,0.62); margin: 0; }
      .amount { font-size: 38px; font-weight: 800; letter-spacing: -0.04em; margin: 14px 0 0; color: #fb923c; }
      .rows { padding: 18px; }
      .row { display: flex; justify-content: space-between; gap: 14px; padding: 10px 0; border-bottom: 1px dashed #e2e8f0; }
      .row:last-child { border-bottom: 0; }
      .k { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #64748b; min-width: 120px; }
      .v { font-size: 14px; font-weight: 600; color: #0f172a; text-align: right; white-space: normal; word-break: break-word; overflow-wrap: anywhere; }
      .footer { padding: 14px 18px 18px; font-size: 11px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="card">
        <div class="hero">
          <div class="eyebrow">Payment request · Trip settlement</div>
          <p class="title">${safe(p.displayId)}</p>
          <p class="sub">${safe(p.fleetName)}</p>
          <p class="sub">${safe(p.from)} → ${safe(p.to)}</p>
          ${driverLine ? `<p class="sub">${safe(driverLine)}</p>` : ``}
          ${p.tripDate ? `<p class="sub">${safe(p.tripDate)}</p>` : ``}
          <p class="amount">₹${Math.round(p.amount).toLocaleString('en-IN')}</p>
        </div>
        <div class="rows">
          ${p.paymentRequestId ? `<div class="row"><div class="k">Request reference</div><div class="v">${safe(p.paymentRequestId)}</div></div>` : ``}
          <div class="row"><div class="k">Request type</div><div class="v">Trip-based payment</div></div>
          <div class="row"><div class="k">Fleet</div><div class="v">${safe(p.fleetName)}</div></div>
          <div class="row"><div class="k">Status</div><div class="v">${safe(p.status)}</div></div>
          <div class="row"><div class="k">Captured at</div><div class="v">${safe(p.capturedAt)}</div></div>
          <div class="row"><div class="k">Trip</div><div class="v">${safe(p.displayId)}</div></div>
          <div class="row"><div class="k">Route</div><div class="v">${safe(`${p.from} → ${p.to}`)}</div></div>
        </div>
        <div class="footer">Share this PDF with your fleet accounts team. Generated from Q Driver · ${safe(p.capturedAt)}</div>
      </div>
    </div>
  </body>
</html>`;
  }, []);

  const shareTripClaimPdf = useCallback(
    async (p: {
      fleetName: string;
      displayId: string;
      amount: number;
      from: string;
      to: string;
      status: string;
      capturedAt: string;
      driverName?: string | null;
      driverPhone?: string | null;
      tripDate?: string | null;
      paymentRequestId?: string | null;
    }) => {
      const html = buildTripClaimHtml(p);
      const file = await Print.printToFileAsync({ html });
      if (Platform.OS === 'web') {
        window.open(file.uri, '_blank');
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Share unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share payment request (PDF)',
        UTI: 'com.adobe.pdf',
      });
    },
    [buildTripClaimHtml],
  );

  const buildBulkClaimHtml = useCallback((p: {
    driverName?: string | null;
    driverPhone?: string | null;
    generatedAt: string;
    groups: {
      fleetName: string;
      total: number;
      trips: { displayId: string; amount: number; date: string; route: string; status: string }[];
    }[];
  }) => {
    const safe = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    const driverLine = [p.driverName?.trim() || null, p.driverPhone?.trim() || null].filter(Boolean).join(' · ');
    const groupsHtml = p.groups
      .map((g) => {
        const tripsHtml = g.trips
          .map(
            (t) => `
            <div class="trip">
              <div class="tripTop">
                <div class="tripId">${safe(t.displayId)}</div>
                <div class="tripAmt">₹${Math.round(t.amount).toLocaleString('en-IN')}</div>
              </div>
              <div class="tripMeta">${safe(t.date)} · ${safe(t.status)}</div>
              <div class="tripRoute">${safe(t.route)}</div>
            </div>`,
          )
          .join('');
        return `
          <div class="group">
            <div class="groupHead">
              <div class="groupName">${safe(g.fleetName)}</div>
              <div class="groupTotal">₹${Math.round(g.total).toLocaleString('en-IN')}</div>
            </div>
            ${tripsHtml}
          </div>`;
      })
      .join('');

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial; margin: 0; color: #0f172a; background: #ffffff; }
      .page { padding: 22px; }
      .hero { border: 1px solid #e2e8f0; border-radius: 18px; padding: 18px; background: #0b1220; color: #fff; }
      .eyebrow { font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: rgba(255,255,255,0.65); margin-bottom: 10px; }
      .title { font-size: 18px; font-weight: 700; margin: 0 0 6px; }
      .sub { font-size: 12px; color: rgba(255,255,255,0.62); margin: 0; }
      .group { margin-top: 16px; border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden; }
      .groupHead { display:flex; justify-content: space-between; gap: 14px; padding: 14px 16px; background: #f8fafc; border-bottom: 1px dashed #e2e8f0; }
      .groupName { font-size: 13px; font-weight: 700; }
      .groupTotal { font-size: 14px; font-weight: 800; color: #fb923c; }
      .trip { padding: 12px 16px; border-bottom: 1px solid #eef2f7; }
      .trip:last-child { border-bottom: 0; }
      .tripTop { display:flex; justify-content: space-between; gap: 12px; }
      .tripId { font-size: 12px; font-weight: 700; }
      .tripAmt { font-size: 12px; font-weight: 800; }
      .tripMeta { margin-top: 6px; font-size: 11px; color: #64748b; }
      .tripRoute { margin-top: 6px; font-size: 12px; color: #0f172a; word-break: break-word; overflow-wrap: anywhere; }
      .footer { margin-top: 14px; font-size: 11px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="hero">
        <div class="eyebrow">Pending trip claims</div>
        <div class="title">Claim summary</div>
        ${driverLine ? `<p class="sub">${safe(driverLine)}</p>` : ``}
        <p class="sub">Generated at ${safe(p.generatedAt)}</p>
      </div>
      ${groupsHtml}
      <div class="footer">Generated from Q Driver · ${safe(p.generatedAt)}</div>
    </div>
  </body>
</html>`;
  }, []);

  const shareBulkClaimPdf = useCallback(
    async (p: Parameters<typeof buildBulkClaimHtml>[0]) => {
      const html = buildBulkClaimHtml(p);
      const file = await Print.printToFileAsync({ html });
      if (Platform.OS === 'web') {
        window.open(file.uri, '_blank');
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Share unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share claim PDF',
        UTI: 'com.adobe.pdf',
      });
    },
    [buildBulkClaimHtml],
  );

  const buildTripSettlementHtml = useCallback((p: {
    fleetName: string;
    displayId: string;
    amount: number;
    transactionId: string;
    utr: string;
    paymentMode: string;
    capturedAt: string;
    route: string;
  }) => {
    const safe = (s: string) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial; margin: 0; color: #0f172a; }
      .page { padding: 24px; }
      .card { border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden; }
      .hero { padding: 28px 22px 20px; text-align: center; background: #f8fafc; }
      .check { width: 64px; height: 64px; border-radius: 999px; background: #dcfce7; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px; }
      .check svg { width: 30px; height: 30px; color: #16a34a; }
      .eyebrow { font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: #16a34a; margin-bottom: 10px; }
      .amount { font-size: 44px; font-weight: 700; letter-spacing: -0.04em; margin: 0; }
      .sub { margin-top: 10px; font-size: 12px; color: #64748b; }
      .divider { border-top: 1px dashed #e2e8f0; }
      .rows { padding: 18px 18px 10px; }
      .row { display: flex; justify-content: space-between; gap: 14px; padding: 10px 0; }
      .k { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #64748b; min-width: 120px; }
      .v { font-size: 14px; font-weight: 600; color: #0f172a; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .footer { padding: 16px 18px 18px; font-size: 11px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="card">
        <div class="hero">
          <div class="check" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="eyebrow">Settlement received</div>
          <p class="amount">₹${Math.round(p.amount).toLocaleString('en-IN')}</p>
          <div class="sub">${safe(p.displayId)} · ${safe(p.fleetName)}</div>
        </div>
        <div class="divider"></div>
        <div class="rows">
          <div class="row"><div class="k">Transaction ID</div><div class="v">${safe(p.transactionId)}</div></div>
          <div class="row"><div class="k">UTR</div><div class="v">${safe(p.utr)}</div></div>
          <div class="row"><div class="k">Payment mode</div><div class="v">${safe(p.paymentMode)}</div></div>
          <div class="row"><div class="k">Captured at</div><div class="v">${safe(p.capturedAt)}</div></div>
          <div class="row"><div class="k">Route</div><div class="v">${safe(p.route)}</div></div>
        </div>
        <div class="footer">Generated from Q Driver · ${safe(p.capturedAt)}</div>
      </div>
    </div>
  </body>
</html>`;
  }, []);

  const shareTripSettlementPdf = useCallback(
    async (p: {
      fleetName: string;
      displayId: string;
      amount: number;
      transactionId: string;
      utr: string;
      paymentMode: string;
      capturedAt: string;
      route: string;
    }) => {
      const html = buildTripSettlementHtml(p);
      const file = await Print.printToFileAsync({ html });
      if (Platform.OS === 'web') {
        window.open(file.uri, '_blank');
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Share unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share receipt PDF',
        UTI: 'com.adobe.pdf',
      });
    },
    [buildTripSettlementHtml],
  );

  const claimTripInAppAndShare = useCallback(
    async (p: { trip: tripsService.TripRow; displayId: string; fleetName: string; amount: number; from: string; to: string; status: string }) => {
      const { trip, displayId, fleetName, amount, from, to, status } = p;
      const driverId = trip.driver_id ?? linkedDrivers[0]?.id ?? null;
      const orgId = trip.organization_id ?? null;
      const reqAmount = Math.round(amount);
      if (!driverId || !orgId) return;
      if (!Number.isFinite(reqAmount) || reqAmount <= 0) return;

      setRequestPaymentLoadingTripId(trip.id);
      try {
        const { error, request } = await salaryRequestsService.createSalaryRequest(driverId, orgId, 'trip_based', reqAmount, {
          createdBy: profile?.uid ?? null,
          tripIds: [trip.id],
          note: `Request for payment (wallet): ${displayId}`,
        });
        if (error) {
          if (Platform.OS === 'web') window.alert(`Could not create claim: ${error.message}`);
          else Alert.alert('Could not create claim', error.message);
          return;
        }

        const capturedAt = phonePeMetaDate(trip.completed_at ?? trip.updated_at ?? trip.created_at);
        const driverRow = linkedDrivers.find((d) => String(d.id) === String(driverId)) ?? linkedDrivers[0] ?? null;
        const tripDate = new Date(trip.completed_at ?? trip.updated_at ?? trip.created_at ?? '').toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        const paymentRequestId = request?.id ? String(request.id) : null;
        await shareTripClaimPdf({
          fleetName,
          displayId,
          amount: reqAmount,
          from,
          to,
          status,
          capturedAt,
          driverName: driverRow?.name ?? null,
          driverPhone: driverRow?.phone ?? null,
          tripDate,
          paymentRequestId,
        });

        const msg = buildTripClaimWhatsappMessage({
          fleetName,
          tripId: displayId,
          amount: reqAmount,
          status,
          from,
          to,
          tripDate,
          driverName: driverRow?.name ?? null,
          driverPhone: driverRow?.phone ?? null,
        });
        await openWhatsAppReminder(msg);
      } finally {
        setRequestPaymentLoadingTripId(null);
      }
    },
    [linkedDrivers, profile?.uid, shareTripClaimPdf, openWhatsAppReminder],
  );

  const { pendingTrips, receivedTrips, filteredTrips, pendingTotal, receivedTotal } = useMemo(() => {
    const visibleTrips = [...completedTrips]
      .sort((a, b) => {
        const da = new Date(a.completed_at ?? a.updated_at ?? a.created_at).getTime();
        const db = new Date(b.completed_at ?? b.updated_at ?? b.created_at).getTime();
        return db - da;
      });

    const pending = visibleTrips.filter((t) => (receivedByTripId[t.id] ?? 0) === 0);
    const received = visibleTrips.filter((t) => (receivedByTripId[t.id] ?? 0) > 0);
    const pendingSum = pending.reduce((s, t) => s + tripEarnings(t), 0);
    const receivedSum = received.reduce((s, t) => s + tripEarnings(t), 0);
    const list =
      transactionFilter === 'pending'
        ? pending
        : transactionFilter === 'received'
          ? received
          : visibleTrips;
    return {
      pendingTrips: pending,
      receivedTrips: received,
      filteredTrips: list,
      pendingTotal: pendingSum,
      receivedTotal: receivedSum,
    };
  }, [completedTrips, receivedByTripId, transactionFilter]);

  /** UPI-style: trips grouped by date section (Today, Yesterday, 5 Mar, ...) */
  const transactionSections = useMemo(() => {
    const list = filteredTrips.slice(0, 50);
    const bySection: { sectionLabel: string; dateKey: string; trips: typeof list }[] = [];
    let currentKey = '';
    let currentGroup: typeof list = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const raw = t.completed_at ?? t.updated_at ?? t.created_at ?? '';
      const dateKey = raw ? new Date(raw).toISOString().slice(0, 10) : '';
      if (dateKey !== currentKey) {
        if (currentGroup.length > 0) {
          const first = currentGroup[0];
          bySection.push({
            sectionLabel: formatTransactionDateSection(first.completed_at ?? first.updated_at ?? first.created_at ?? ''),
            dateKey: currentKey,
            trips: currentGroup,
          });
        }
        currentKey = dateKey;
        currentGroup = [t];
      } else {
        currentGroup.push(t);
      }
    }
    if (currentGroup.length > 0) {
      const first = currentGroup[0];
      bySection.push({
        sectionLabel: formatTransactionDateSection(first.completed_at ?? first.updated_at ?? first.created_at ?? ''),
        dateKey: currentKey,
        trips: currentGroup,
      });
    }
    return bySection;
  }, [filteredTrips]);

  const pendingTripSections = useMemo(() => {
    const list = pendingTrips.slice(0, 50);
    const bySection: { sectionLabel: string; dateKey: string; trips: typeof list }[] = [];
    let currentKey = '';
    let currentGroup: typeof list = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const raw = t.completed_at ?? t.updated_at ?? t.created_at ?? '';
      const dateKey = raw ? new Date(raw).toISOString().slice(0, 10) : '';
      if (dateKey !== currentKey) {
        if (currentGroup.length > 0) {
          const first = currentGroup[0];
          bySection.push({
            sectionLabel: formatTransactionDateSection(first.completed_at ?? first.updated_at ?? first.created_at ?? ''),
            dateKey: currentKey,
            trips: currentGroup,
          });
        }
        currentKey = dateKey;
        currentGroup = [t];
      } else {
        currentGroup.push(t);
      }
    }
    if (currentGroup.length > 0) {
      const first = currentGroup[0];
      bySection.push({
        sectionLabel: formatTransactionDateSection(first.completed_at ?? first.updated_at ?? first.created_at ?? ''),
        dateKey: currentKey,
        trips: currentGroup,
      });
    }
    return bySection;
  }, [pendingTrips]);

  const receivedTripSections = useMemo(() => {
    const list = receivedTrips.slice(0, 50);
    const bySection: { sectionLabel: string; dateKey: string; trips: typeof list }[] = [];
    let currentKey = '';
    let currentGroup: typeof list = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const raw = t.completed_at ?? t.updated_at ?? t.created_at ?? '';
      const dateKey = raw ? new Date(raw).toISOString().slice(0, 10) : '';
      if (dateKey !== currentKey) {
        if (currentGroup.length > 0) {
          const first = currentGroup[0];
          bySection.push({
            sectionLabel: formatTransactionDateSection(first.completed_at ?? first.updated_at ?? first.created_at ?? ''),
            dateKey: currentKey,
            trips: currentGroup,
          });
        }
        currentKey = dateKey;
        currentGroup = [t];
      } else {
        currentGroup.push(t);
      }
    }
    if (currentGroup.length > 0) {
      const first = currentGroup[0];
      bySection.push({
        sectionLabel: formatTransactionDateSection(first.completed_at ?? first.updated_at ?? first.created_at ?? ''),
        dateKey: currentKey,
        trips: currentGroup,
      });
    }
    return bySection;
  }, [receivedTrips]);

  // Cash balance:
  // - trip-related cash is only counted once the driver verifies (verified entries are type === 'settlement').
  // - non-trip ledger entries (salary/reimbursement/etc) still affect cash as before.
  const totalReceived = Math.round(
    ledgerEntries.reduce((sum, e) => {
      const tid = e.trip_id?.trim() || null;
      const amt = Number(e.amount) || 0;
      if (tid) {
        return e.type === 'settlement' ? sum + amt : sum;
      }
      return sum + amt;
    }, 0),
  );

  /** Cash card: pulse + watermark motion (reference wallet hero). */
  const cashCardSparklePulse = useSharedValue(0);
  const cashCardWatermarkDrift = useSharedValue(0);
  useEffect(() => {
    cashCardSparklePulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.2, { duration: 1500 })
      ),
      -1,
      false
    );
    cashCardWatermarkDrift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 4000 })
      ),
      -1,
      false
    );
  }, [cashCardSparklePulse, cashCardWatermarkDrift]);

  const cashSparkleAnimStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + cashCardSparklePulse.value * 0.5,
    transform: [{ scale: 0.92 + cashCardSparklePulse.value * 0.14 }],
  }));

  const cashWatermarkAnimStyle = useAnimatedStyle(() => ({
    opacity: 0.1 + cashCardWatermarkDrift.value * 0.08,
    transform: [
      { rotate: `${-8 + cashCardWatermarkDrift.value * 16}deg` },
      { translateY: cashCardWatermarkDrift.value * 6 - 3 },
    ],
  }));

  /** Salary request: only show connected fleets (accepted invite). Use org name from invite when available, else "Fleet". */
  const salaryRequestOrgOptions = useMemo(() => {
    const accepted = invites.filter((i) => (i.status || '').toLowerCase() === 'accepted');
    return linkedDrivers
      .filter((d) => accepted.some((i) => String(i.from_organization_id || '') === String(d.organization_id || '')))
      .map((d) => {
        const inv = accepted.find(
          (i) => String(i.from_organization_id || '') === String(d.organization_id || '')
        );
        const rawName =
          (inv && (inv as { from_org_name?: string | null; fromOrgName?: string | null }).from_org_name) ||
          (inv && (inv as { from_org_name?: string | null; fromOrgName?: string | null }).fromOrgName) ||
          null;
        const name = (rawName && String(rawName).trim()) ? String(rawName).trim() : null;
        return {
          driverId: d.id,
          orgId: d.organization_id,
          orgName: name || 'Fleet',
        };
      });
  }, [linkedDrivers, invites]);

  const fleetCards = useMemo(() => {
    return salaryRequestOrgOptions.map((fleet) => {
      const fleetTrips = completedTrips.filter(
        (trip) =>
          String(trip.organization_id ?? '') === String(fleet.orgId) &&
          String(trip.driver_id ?? '') === String(fleet.driverId),
      );
      const earned = Math.round(fleetTrips.reduce((sum, trip) => sum + tripEarnings(trip), 0));
      // Received for trip progress = only verified settlements.
      const received = Math.round(
        ledgerEntries
          .filter(
            (entry) =>
              entry.type === 'settlement' &&
              !!entry.trip_id &&
              String(entry.organization_id ?? '') === String(fleet.orgId) &&
              String(entry.driver_id ?? '') === String(fleet.driverId),
          )
          .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
      );
      const pending = Math.max(0, earned - received);
      const progress = earned > 0 ? Math.min(100, Math.round((received / earned) * 100)) : 0;

      return {
        ...fleet,
        tripsCompleted: fleetTrips.length,
        earned,
        received,
        pending,
        progress,
      };
    });
  }, [salaryRequestOrgOptions, completedTrips, ledgerEntries]);

  const tripJourneyItems = useMemo(() => {
    return completedTrips.map((trip) => {
      const receivedAmt = receivedByTripId[trip.id] ?? 0;
      const isSettled = receivedAmt > 0;
      const fleetPendingLedger = latestFleetPaidPendingLedgerByTripId[trip.id];
      const hasFleetPending = !!fleetPendingLedger;
      const isActionRequired = !isSettled && !hasFleetPending && isAggregateTrip(trip) && tripEarnings(trip) === 0;
      const status: 'Pending' | 'Action Required' | 'Settled' = isSettled
        ? 'Settled'
        : isActionRequired
          ? 'Action Required'
          : 'Pending';
      const latestLedger = latestCreditLedgerByTripId[trip.id];
      const latestDesc = latestLedger?.description ?? null;
      const hasReceiptMeta = !!latestDesc && /(\\bUTR\\b|\\bMode\\s*:)/i.test(String(latestDesc));
      const paymentMode = derivePaymentMode(latestDesc);
      const paidLabel = hasReceiptMeta
        ? 'Paid synced'
        : paymentMode === 'UPI'
          ? 'Paid via UPI'
          : paymentMode === 'BANK TRANSFER'
            ? 'Paid to bank'
            : paymentMode === 'CASH'
              ? 'Paid in cash'
              : 'Paid to bank';

      const fleetPendingDesc = fleetPendingLedger?.description ?? null;
      const fleetPendingMode = derivePaymentMode(fleetPendingDesc);
      const fleetPendingLabel =
        fleetPendingMode === 'UPI'
          ? 'Fleet marked paid (UPI)'
          : fleetPendingMode === 'BANK TRANSFER'
            ? 'Fleet marked paid (Bank)'
            : fleetPendingMode === 'CASH'
              ? 'Fleet marked paid (Cash)'
              : 'Fleet marked paid';

      const subStatus = isSettled ? paidLabel : isActionRequired ? 'Ready to claim' : hasFleetPending ? fleetPendingLabel : 'Pending from fleet';
      const provider =
        salaryRequestOrgOptions.find(
          (o) =>
            String(o.orgId ?? '') === String(trip.organization_id ?? '') &&
            String(o.driverId ?? '') === String(trip.driver_id ?? ''),
        )?.orgName ??
        salaryRequestOrgOptions.find((o) => String(o.orgId ?? '') === String(trip.organization_id ?? ''))?.orgName ??
        'Fleet';

      return {
        trip,
        id: tripsService.getTripDisplayNumber(trip),
        rawDate: trip.completed_at ?? trip.updated_at ?? trip.created_at ?? '',
        date: formatTransactionDateSection(trip.completed_at ?? trip.updated_at ?? trip.created_at ?? ''),
        amount: Math.round(
          isSettled ? receivedAmt : hasFleetPending ? Number(fleetPendingLedger?.amount ?? tripEarnings(trip)) : tripEarnings(trip),
        ),
        status,
        subStatus,
        provider,
        from: trip.pickup_area?.trim() || 'Unknown origin',
        to: trip.drop_location?.trim() || 'Unknown destination',
        time: new Date(trip.completed_at ?? trip.updated_at ?? trip.created_at ?? '').toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
        fleetPendingLedger: fleetPendingLedger ?? null,
      };
    });
  }, [completedTrips, receivedByTripId, salaryRequestOrgOptions, latestCreditLedgerByTripId, derivePaymentMode, latestFleetPaidPendingLedgerByTripId]);

  const filteredTripJourneyItems = useMemo(() => {
    const search = journeySearch.trim().toLowerCase();
    return tripJourneyItems.filter((item) => {
      const matchesSearch =
        search.length === 0 ||
        item.id.toLowerCase().includes(search) ||
        item.from.toLowerCase().includes(search) ||
        item.to.toLowerCase().includes(search) ||
        item.provider.toLowerCase().includes(search);

      const matchesFilter =
        journeyFilter === 'all' ||
        (journeyFilter === 'pending' && (item.status === 'Pending' || item.status === 'Action Required')) ||
        (journeyFilter === 'fleet_marked' && !!item.fleetPendingLedger) ||
        (journeyFilter === 'settled' && item.status === 'Settled');

      return matchesSearch && matchesFilter;
    });
  }, [tripJourneyItems, journeySearch, journeyFilter]);

  const pendingTripJourneyItems = useMemo(() => {
    return filteredTripJourneyItems.filter((i) => i.status === 'Action Required' || (i.status === 'Pending' && !i.fleetPendingLedger));
  }, [filteredTripJourneyItems]);

  const claimAllPendingTrips = useCallback(async () => {
    if (claimAllLoading) return;
    if (pendingTripJourneyItems.length === 0) return;
    setClaimAllLoading(true);

    try {
      const groups = new Map<
        string,
        {
          orgId: string;
          driverId: string;
          fleetName: string;
          tripIds: string[];
          total: number;
          trips: { displayId: string; amount: number; date: string; route: string; status: string }[];
        }
      >();

      for (const item of pendingTripJourneyItems) {
        const orgId = item.trip.organization_id ?? '';
        const driverId = item.trip.driver_id ?? '';
        if (!orgId || !driverId) continue;
        const key = `${orgId}:${driverId}`;
        const g =
          groups.get(key) ?? {
            orgId,
            driverId,
            fleetName: item.provider.split("'")[0],
            tripIds: [],
            total: 0,
            trips: [],
          };
        g.tripIds.push(item.trip.id);
        g.total += Math.round(item.amount);
        const date = new Date(item.trip.completed_at ?? item.trip.updated_at ?? item.trip.created_at ?? '').toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        g.trips.push({
          displayId: item.id,
          amount: Math.round(item.amount),
          date,
          route: `${item.from} → ${item.to}`,
          status: item.subStatus || item.status,
        });
        groups.set(key, g);
      }

      for (const g of groups.values()) {
        if (g.tripIds.length === 0 || g.total <= 0) continue;
        await salaryRequestsService.createSalaryRequest(g.driverId, g.orgId, 'trip_based', g.total, {
          createdBy: profile?.uid ?? null,
          tripIds: g.tripIds,
          note: `Bulk claim (${g.tripIds.length} trips)`,
        });
      }

      const primaryDriver = linkedDrivers[0] ?? null;
      const generatedAt = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      await shareBulkClaimPdf({
        driverName: primaryDriver?.name ?? null,
        driverPhone: primaryDriver?.phone ?? null,
        generatedAt,
        groups: Array.from(groups.values()).map((g) => ({
          fleetName: g.fleetName,
          total: g.total,
          trips: g.trips,
        })),
      });

      const totalAmount = Array.from(groups.values()).reduce((sum, g) => sum + g.total, 0);
      const msg = buildBulkTripClaimWhatsappMessage({
        tripCount: pendingTripJourneyItems.length,
        totalAmount,
        driverName: primaryDriver?.name ?? null,
        driverPhone: primaryDriver?.phone ?? null,
      });
      await openWhatsAppReminder(msg);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not claim pending trips.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Claim failed', message);
    } finally {
      setClaimAllLoading(false);
    }
  }, [claimAllLoading, pendingTripJourneyItems, linkedDrivers, profile?.uid, shareBulkClaimPdf, openWhatsAppReminder]);

  const filteredTripJourneySections = useMemo(() => {
    const map = new Map<string, typeof filteredTripJourneyItems>();
    filteredTripJourneyItems.forEach((item) => {
      const bucket = map.get(item.date) ?? [];
      bucket.push(item);
      map.set(item.date, bucket);
    });
    return Array.from(map.entries()).map(([sectionLabel, items]) => ({ sectionLabel, items }));
  }, [filteredTripJourneyItems]);

  const filteredCashTrips = useMemo(() => {
    const search = journeySearch.trim().toLowerCase();
    return receivedTrips.filter((trip) => {
      const orgName =
        salaryRequestOrgOptions.find((o) => String(o.orgId ?? '') === String(trip.organization_id ?? ''))?.orgName ?? 'Fleet';
      const haystack = [
        tripsService.getTripDisplayNumber(trip),
        trip.pickup_area ?? '',
        trip.drop_location ?? '',
        orgName,
      ]
        .join(' ')
        .toLowerCase();
      return search.length === 0 || haystack.includes(search);
    });
  }, [receivedTrips, journeySearch, salaryRequestOrgOptions]);

  const filteredCashSections = useMemo(() => {
    const list = [...filteredCashTrips]
      .sort((a, b) => {
        const da = new Date(a.completed_at ?? a.updated_at ?? a.created_at).getTime();
        const db = new Date(b.completed_at ?? b.updated_at ?? b.created_at).getTime();
        return db - da;
      })
      .slice(0, 50);

    const bySection: { sectionLabel: string; trips: typeof list }[] = [];
    let current = '';
    let bucket: typeof list = [];
    for (const trip of list) {
      const label = formatTransactionDateSection(trip.completed_at ?? trip.updated_at ?? trip.created_at ?? '');
      if (label !== current) {
        if (bucket.length) bySection.push({ sectionLabel: current, trips: bucket });
        current = label;
        bucket = [trip];
      } else {
        bucket.push(trip);
      }
    }
    if (bucket.length) bySection.push({ sectionLabel: current, trips: bucket });
    return bySection;
  }, [filteredCashTrips]);

  /** Request payment for this trip: route user to Salary Request screen. */
  const openSalaryRequestForTrip = useCallback(
    (trip: tripsService.TripRow) => {
      // Keep Wallet self-contained: route to existing Salary Request flow.
      // (Salary Request screen already supports trip-based requests.)
      router.push('/(driver)/salary-request');
      setExpandedTripId(null);
    },
    [router]
  );

  /** Mark trip as paid (settlement ledger entry). */
  const markTripAsPaid = useCallback(
    async (
      trip: tripsService.TripRow,
      amount: number,
      sourceLedger?: driversService.DriverLedgerRow | null,
    ) => {
      const driverId = trip.driver_id ?? linkedDrivers[0]?.id;
      if (!driverId || !trip.organization_id) {
        Alert.alert('Error', 'Missing driver or organization.');
        return;
      }

      const rawDescription = sourceLedger?.description ?? `Trip ${tripsService.getTripDisplayNumber(trip)}`;
      // Remove the "pending verification" token so the settled receipt looks clean.
      const settledDescription = rawDescription.replace(/\s*\|\s*Sync\s*:\s*FLEET_PAID_PENDING\s*/i, '').trim();

      setMarkPaidLoadingTripId(trip.id);
      let { error, row } = await driversService.createDriverLedgerEntry(
        trip.organization_id,
        driverId,
        Math.round(amount),
        'settlement',
        { tripId: trip.id, createdBy: profile?.uid ?? null, description: settledDescription }
      );
      if (error?.message?.includes("driver_ledger_created_by_fkey")) {
        const retry = await driversService.createDriverLedgerEntry(
          trip.organization_id,
          driverId,
          Math.round(amount),
          'settlement',
          { tripId: trip.id, createdBy: null, description: settledDescription }
        );
        error = retry.error;
        if (retry.row) row = retry.row;
      }
      setMarkPaidLoadingTripId(null);
      if (error) {
        const isDriverLedgerRls =
          /row-level security policy.*driver_ledger|driver_ledger.*row-level security/i.test(error.message);
        const message = isDriverLedgerRls
          ? "You don't have permission to record this payment. Ensure the database has the driver settlement policy applied (migration: 20250324120000_driver_ledger_driver_settlement_insert)."
          : error.message;
        if (Platform.OS === 'web') {
          window.alert(`Could not mark as paid: ${message}`);
        } else {
          Alert.alert('Could not mark as paid', message);
        }
        return;
      }
      
      if (row) {
        setLedgerEntries(prev => [row!, ...prev]);
      } else {
        load();
      }
    },
    [linkedDrivers, profile?.uid, load]
  );

  /** Confirm then mark trip as paid. */
  const confirmMarkAsPaid = useCallback(
    (trip: tripsService.TripRow, amount: number, sourceLedger?: driversService.DriverLedgerRow | null) => {
      setMarkPaidConfirmState({ trip, amount, sourceLedger: sourceLedger ?? null });
    },
    []
  );

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.emerald} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading…</Text>
      </View>
    );
  }

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: insets.top + Layout.driverHeaderTopOffset, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.push('/(driver)/profile')}
            style={styles.avatarBtn}
            activeOpacity={0.8}
          >
            <View style={[styles.avatarCircle, { borderColor: colors.border, backgroundColor: colors.emeraldMuted }]}>
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            </View>
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.brand, { color: colors.textMuted }]}>Q PILOT</Text>
            <Text style={[styles.welcomeTitle, { color: colors.text }]} numberOfLines={1}>Cash</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => {
            if (salaryRequestOrgOptions.length > 0) {
              const fleet = salaryRequestOrgOptions[0];
              router.push({
                pathname: `/(driver)/passbook/${fleet.orgId}`,
                params: { orgName: fleet.orgName, from: 'wallet' },
              } as Parameters<typeof router.push>[0]);
            } else {
              router.push('/(driver)');
            }
          }}
          style={[styles.passbookHeaderBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
          accessibilityLabel="Passbook"
          accessibilityHint="Opens passbook by fleet"
        >
          <FontAwesome name="book" size={18} color={colors.emerald} />
          <Text style={[styles.passbookHeaderBtnText, { color: colors.emerald }]}>Passbook</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.creditsSection}>
        <Text style={[styles.creditsTitle, { color: EMERALD_500 }]}>SALARY.</Text>
        <Text style={[styles.creditsSubtitle, { color: GRAY_700 }]}>Financial audit & settlements.</Text>
      </View>

      <View style={styles.walletCardWrap}>
        <LinearGradient
          colors={
            isDark
              ? [EMERALD_950, Theme.driverEmeraldDark]
              : [Theme.driverEmeraldDark, Theme.driverEmerald]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.walletCard,
            {
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.22)',
              shadowColor: isDark ? 'rgba(2,44,34,0.85)' : 'rgba(6,95,70,0.38)',
              shadowOffset: { width: 0, height: 20 },
              shadowOpacity: 1,
              shadowRadius: 40,
              elevation: 8,
            },
          ]}
        >
          <Animated.View
            style={[styles.walletCardWatermarkWrap, cashWatermarkAnimStyle, { pointerEvents: 'none' }]}
          >
            <Wallet size={112} color={EMERALD_400} strokeWidth={1.4} />
          </Animated.View>
          <View style={styles.walletCardContent}>
            <View style={styles.walletCardLabelRow}>
              <Animated.View style={cashSparkleAnimStyle}>
                <Sparkles size={17} color="rgba(236,253,245,0.95)" strokeWidth={2.5} />
              </Animated.View>
              <Text style={[styles.walletCardLabel, { color: EMERALD_200_90 }]}>CASH BALANCE</Text>
            </View>
            <View style={styles.walletCardBalanceRow}>
              <Text style={[styles.walletCardBalanceRupee, { color: '#ffffff' }]}>₹</Text>
              <Text
                style={[
                  styles.walletCardBalanceNumber,
                  isAndroid && styles.walletCardBalanceNumberAndroid,
                  { color: '#ffffff' },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {totalReceived.toLocaleString('en-IN')}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.walletCardWithdrawBtn,
                {
                  backgroundColor: 'rgba(248,250,252,0.96)',
                  borderColor: 'rgba(255,255,255,0.38)',
                  shadowColor: '#000',
                },
              ]}
              activeOpacity={0.85}
              onPress={() => router.push('/(driver)/salary-request')}
              accessibilityLabel="Salary request"
              accessibilityHint="Request salary from your fleet"
            >
              <Text style={[styles.walletCardWithdrawText, { color: Theme.textPrimaryDark }]}>
                SALARY REQUEST
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      <View
        style={[
          styles.mainTabsWrap,
          {
            backgroundColor: isDark ? colors.surfaceElevated : 'rgba(226,232,240,0.55)',
            borderColor: isDark ? colors.borderSubtle : 'rgba(255,255,255,0.7)',
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.mainTab,
            mainTab === 'fleet' && [
              styles.mainTabActive,
              { backgroundColor: colors.surface, borderColor: isDark ? colors.borderSubtle : colors.border },
            ],
          ]}
          onPress={() => setMainTab('fleet')}
          activeOpacity={0.92}
        >
          <FontAwesome name="users" size={14} color={mainTab === 'fleet' ? colors.emerald : colors.textMuted} />
          <Text style={[styles.mainTabText, mainTab === 'fleet' ? { color: colors.emerald } : { color: colors.textMuted }]}>Fleet</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.mainTab,
            mainTab === 'trips' && [
              styles.mainTabActive,
              { backgroundColor: colors.surface, borderColor: isDark ? colors.borderSubtle : colors.border },
            ],
          ]}
          onPress={() => setMainTab('trips')}
          activeOpacity={0.92}
        >
          <FontAwesome name="history" size={14} color={mainTab === 'trips' ? colors.emerald : colors.textMuted} />
          <Text style={[styles.mainTabText, mainTab === 'trips' ? { color: colors.emerald } : { color: colors.textMuted }]}>Trips</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.mainTab,
            mainTab === 'cash' && [
              styles.mainTabActive,
              { backgroundColor: colors.surface, borderColor: isDark ? colors.borderSubtle : colors.border },
            ],
          ]}
          onPress={() => setMainTab('cash')}
          activeOpacity={0.92}
        >
          <FontAwesome name="credit-card" size={14} color={mainTab === 'cash' ? colors.emerald : colors.textMuted} />
          <Text style={[styles.mainTabText, mainTab === 'cash' ? { color: colors.emerald } : { color: colors.textMuted }]}>Cash</Text>
        </TouchableOpacity>
      </View>

      {(mainTab === 'trips' || mainTab === 'cash') && (
        <View style={styles.searchSection}>
          <SearchBar
            value={journeySearch}
            onChangeText={setJourneySearch}
            placeholder={mainTab === 'trips' ? 'Search trips...' : 'Search settlements...'}
          />

          {mainTab === 'trips' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipRow}
            >
              {[
                { id: 'all', label: 'All' },
                { id: 'pending', label: 'Pending' },
                { id: 'fleet_marked', label: 'Fleet marked' },
                { id: 'settled', label: 'Settled' },
              ].map((chip) => {
                const active = journeyFilter === chip.id;
                return (
                  <TouchableOpacity
                    key={chip.id}
                    onPress={() => setJourneyFilter(chip.id as 'all' | 'pending' | 'fleet_marked' | 'settled')}
                    style={[
                      styles.filterChip,
                      active
                        ? { backgroundColor: colors.emerald, borderColor: colors.emerald }
                        : { backgroundColor: colors.surface, borderColor: isDark ? colors.borderSubtle : '#e2e8f0' },
                    ]}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.filterChipText, { color: active ? colors.textOnPrimary : colors.textMuted }]}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {mainTab === 'trips' && journeyFilter === 'pending' && pendingTripJourneyItems.length > 0 && (
            <TouchableOpacity
              activeOpacity={0.88}
              style={[
                styles.bulkClaimButton,
                { backgroundColor: colors.emerald, shadowColor: isDark ? '#000' : 'rgba(4,120,87,0.35)' },
              ]}
              onPress={() => claimAllPendingTrips().catch(() => {})}
              disabled={claimAllLoading}
            >
              <FontAwesome name={claimAllLoading ? 'spinner' : 'whatsapp'} size={16} color={colors.textOnPrimary} />
              <Text style={styles.bulkClaimButtonText}>
                {claimAllLoading ? 'REQUESTING…' : `CLAIM ALL (${pendingTripJourneyItems.length})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {mainTab === 'fleet' ? (
        <View style={[styles.ledgerSection, { paddingHorizontal: Layout.screenPaddingHorizontal }]}>
          <Text style={[styles.transactionHistoryTitle, { color: colors.text }]}>Fleet connections</Text>
          {fleetCards.length === 0 ? (
            <View style={[styles.ledgerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.ledgerEmpty, { borderBottomWidth: 0 }]}>
                <FontAwesome name="users" size={32} color={colors.textMuted} />
                <Text style={[styles.ledgerEmptyText, { color: colors.textMuted }]}>No connected fleets yet</Text>
              </View>
            </View>
          ) : (
            <View style={styles.fleetList}>
              {fleetCards.map((fleet) => (
                <View
                  key={`${fleet.driverId}-${fleet.orgId}`}
                  style={[
                    styles.fleetCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.9)',
                      shadowColor: isDark ? '#000' : 'rgba(15,23,42,0.10)',
                    },
                  ]}
                >
                  <View style={styles.fleetCardTopRowNew}>
                    <View style={styles.fleetCardTopLeft}>
                      <View
                        style={[
                          styles.fleetCardLogoNew,
                          {
                            backgroundColor: isDark ? colors.surfaceElevated : 'rgba(248,250,252,0.92)',
                            shadowColor: isDark ? '#000' : 'rgba(4,120,87,0.35)',
                            overflow: 'hidden',
                            borderWidth: 1,
                            borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.9)',
                          },
                        ]}
                      >
                        <Image
                          source={{ uri: getFleetAvatarUriForOrg(String(fleet.orgId ?? ''), fleet.orgName) }}
                          style={styles.fleetCardLogoImage}
                          resizeMode="cover"
                        />
                      </View>
                      <View style={styles.fleetCardBody}>
                        <Text style={[styles.fleetCardTitle, { color: colors.text }]} numberOfLines={1}>
                          {fleet.orgName}
                        </Text>
                        <View style={styles.fleetMetaRow}>
                          <FontAwesome name="calendar-o" size={12} color={colors.textMuted} />
                          <Text style={[styles.fleetMetaText, { color: colors.textMuted }]} numberOfLines={1}>
                            Since {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.fleetTopRight}>
                      <View
                        style={[
                          styles.fleetStatusPillNew,
                          {
                            backgroundColor: isDark ? 'rgba(4,120,87,0.18)' : 'rgba(4,120,87,0.10)',
                            borderColor: isDark ? 'rgba(4,120,87,0.35)' : 'rgba(4,120,87,0.18)',
                          },
                        ]}
                      >
                        <Text style={[styles.fleetStatusTextNew, { color: colors.emerald }]}>Accepted</Text>
                      </View>
                      <View style={styles.fleetMetaRowRight}>
                        <FontAwesome name="clock-o" size={12} color={colors.textMuted} />
                        <Text style={[styles.fleetMetaTextRight, { color: colors.textMuted }]}>1Y 3M ACTIVE</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.fleetStatsGridNew}>
                    <View
                      style={[
                        styles.fleetStatBox,
                        {
                          backgroundColor: isDark ? colors.surfaceElevated : 'rgba(248,250,252,0.85)',
                          borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.8)',
                        },
                      ]}
                    >
                      <Text style={[styles.fleetStatBoxLabel, { color: colors.textMuted }]}>Lifetime earned</Text>
                      <Text style={[styles.fleetStatBoxValue, { color: colors.text }]}>₹{fleet.earned.toLocaleString('en-IN')}</Text>
                    </View>
                    <View
                      style={[
                        styles.fleetStatBox,
                        styles.fleetStatBoxWarning,
                        {
                          backgroundColor: isDark ? 'rgba(249,115,22,0.10)' : 'rgba(255,237,213,0.55)',
                          borderColor: isDark ? 'rgba(249,115,22,0.25)' : 'rgba(249,115,22,0.22)',
                        },
                      ]}
                    >
                      <Text style={[styles.fleetStatBoxLabel, { color: isDark ? 'rgba(251,146,60,0.85)' : '#ea580c' }]}>Collect pending</Text>
                      <Text style={[styles.fleetStatBoxValue, { color: isDark ? 'rgb(251,146,60)' : '#ea580c' }]}>₹{fleet.pending.toLocaleString('en-IN')}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.fleetPrimaryButtonNew,
                      {
                        backgroundColor: '#0f172a',
                        shadowColor: isDark ? '#000' : 'rgba(15,23,42,0.35)',
                      },
                    ]}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({
                        pathname: `/(driver)/passbook/${fleet.orgId}`,
                        params: { orgName: fleet.orgName, from: 'wallet' },
                      } as Parameters<typeof router.push>[0])
                    }
                  >
                    <View style={styles.fleetPrimaryButtonLeft}>
                      <View style={[styles.fleetPrimaryRing, { borderColor: colors.emerald }]}>
                        <View style={[styles.fleetPrimaryRingDot, { backgroundColor: colors.emerald }]} />
                      </View>
                      <Text style={[styles.fleetPrimaryButtonText, { color: Theme.textOnPrimary }]}>Inspect fleet center</Text>
                    </View>
                    <FontAwesome name="chevron-right" size={18} color={Theme.textOnPrimary} style={styles.fleetPrimaryButtonArrow} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : mainTab === 'trips' ? (
        <View style={[styles.ledgerSection, { paddingHorizontal: Layout.screenPaddingHorizontal }]}>
          <Text style={[styles.transactionHistoryTitle, { color: colors.text }]}>Trips</Text>
          {filteredTripJourneySections.length === 0 ? (
            <View style={[styles.ledgerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.ledgerEmpty, { borderBottomWidth: 0 }]}>
                <FontAwesome name="search" size={32} color={colors.textMuted} />
                <Text style={[styles.ledgerEmptyText, { color: colors.textMuted }]}>No trips found</Text>
              </View>
            </View>
          ) : (
            <View style={styles.tripsPremiumWrap}>
              {filteredTripJourneySections.map(({ sectionLabel, items }) => (
                <View key={sectionLabel} style={styles.tripsPremiumSection}>
                  <View style={styles.tripsSectionHeaderRow}>
                    <View style={[styles.tripsSectionDot, { backgroundColor: colors.emerald }]} />
                    <Text style={[styles.tripsPremiumSectionLabel, { color: colors.textMuted }]}>{sectionLabel}</Text>
                  </View>

                  <View style={styles.tripsTimeline}>
                    <View
                      pointerEvents="none"
                      style={[
                        styles.tripsTimelineLine,
                        { backgroundColor: isDark ? colors.borderSubtle : 'rgba(4,120,87,0.35)' },
                      ]}
                    />

                    <View style={styles.tripsTimelineList}>
                      {items.map((item) => {
                        const tripId = item.trip.id;
                        const isExpanded = expandedTripId === tripId;
                        const isActionRequired = item.status === 'Action Required';
                        const isPending = item.status === 'Pending' || isActionRequired;
                        const isSettled = item.status === 'Settled';
                        const fleetPendingLedger = item.fleetPendingLedger;
                        const hasFleetPending = !!fleetPendingLedger && !isSettled;
                        const providerShort = item.provider.split("'")[0];
                        const receiptExpanded = expandedTripReceiptId === tripId;
                        const ledger = latestCreditLedgerByTripId[item.trip.id];
                        const settlementTxnId = ledger?.id ?? tripId;
                        const settlementUtr = extractUtr(ledger?.description) ?? '—';
                        const settlementMode = derivePaymentMode(ledger?.description) ?? '—';
                        const settlementCapturedAt = phonePeMetaDate(ledger?.created_at ?? item.trip.completed_at ?? item.trip.updated_at ?? item.trip.created_at);
                        const settlementRoute = `${item.from} → ${item.to}`;

                        const pendingTxnId = fleetPendingLedger?.id ?? tripId;
                        const pendingUtr = extractUtr(fleetPendingLedger?.description) ?? '—';
                        const pendingMode = derivePaymentMode(fleetPendingLedger?.description) ?? '—';
                        const pendingCapturedAt = phonePeMetaDate(
                          fleetPendingLedger?.created_at ?? item.trip.completed_at ?? item.trip.updated_at ?? item.trip.created_at,
                        );
                        const fleetAvatarUri = getFleetAvatarUriForOrg(
                          String(item.trip.organization_id ?? ''),
                          providerShort,
                        );

                        return (
                          <View
                            key={tripId}
                            style={[
                              styles.tripsCard,
                              {
                                backgroundColor: colors.surface,
                                borderColor: isExpanded
                                  ? colors.emerald
                                  : isActionRequired
                                    ? 'rgba(249,115,22,0.65)'
                                    : isDark
                                      ? colors.borderSubtle
                                      : 'rgba(226,232,240,0.9)',
                                shadowColor: isActionRequired ? 'rgba(249,115,22,0.25)' : 'rgba(4,120,87,0.18)',
                              },
                              isExpanded && styles.tripsCardExpanded,
                            ]}
                          >
                            <TouchableOpacity
                              onPress={() => setExpandedTripId((prev) => (prev === tripId ? null : tripId))}
                              activeOpacity={0.82}
                              style={styles.tripsCardTouch}
                            >
                              <View style={styles.tripsCardTop}>
                                <View style={styles.tripsCardTopLeft}>
                                  <View
                                    style={[
                                      styles.tripsIcon,
                                      {
                                        backgroundColor: isActionRequired
                                          ? 'rgba(249,115,22,0.16)'
                                          : isExpanded
                                            ? colors.emerald
                                            : isDark
                                              ? colors.surfaceElevated
                                              : 'rgba(248,250,252,0.92)',
                                      },
                                    ]}
                                  >
                                    {isActionRequired ? (
                                      <FontAwesome name="exclamation-circle" size={18} color="rgb(249,115,22)" />
                                    ) : hasFleetPending || isSettled ? (
                                      <FontAwesome
                                        name="check-circle"
                                        size={18}
                                        color={isExpanded ? colors.textOnPrimary : colors.emerald}
                                      />
                                    ) : (
                                      <Image source={{ uri: fleetAvatarUri }} style={styles.tripsIconImage} resizeMode="cover" />
                                    )}
                                  </View>
                                  <View style={styles.tripsHeadText}>
                                    <Text style={[styles.tripsTripId, { color: colors.text }]}>{item.id}</Text>
                                    <View style={styles.tripsMetaInline}>
                                      <Text style={[styles.tripsMetaText, { color: colors.textMuted }]}>{item.time}</Text>
                                      <Text style={[styles.tripsMetaDot, { color: colors.emerald }]}>•</Text>
                                      <Text style={[styles.tripsMetaText, { color: colors.textMuted }]} numberOfLines={1}>
                                        {providerShort}
                                      </Text>
                                    </View>
                                  </View>
                                </View>

                                <View style={styles.tripsCardRight}>
                                  <Text style={[styles.tripsAmount, { color: colors.text }]}>₹{item.amount.toLocaleString('en-IN')}</Text>
                                  <View style={styles.tripsStatusRow}>
                                    <Text
                                      style={[
                                        styles.tripsStatusPill,
                                        isActionRequired
                                          ? styles.tripsStatusWarning
                                          : isPending
                                            ? styles.tripsStatusInfo
                                            : styles.tripsStatusSuccess,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {item.subStatus || item.status}
                                    </Text>
                                    <FontAwesome
                                      name="chevron-down"
                                      size={16}
                                      color={colors.textMuted}
                                      style={isExpanded ? styles.tripsChevronExpanded : undefined}
                                    />
                                  </View>
                                  {__DEV__ ? (
                                    <Text style={[styles.tripsDebugSyncToken, { color: hasFleetPending ? colors.emerald : colors.textMuted }]}>
                                      {hasFleetPending ? 'SYNC TOKEN: FOUND' : 'SYNC TOKEN: MISSING'}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>

                              <View
                                style={[
                                  styles.tripsRouteCard,
                                  {
                                    backgroundColor: isDark ? colors.surfaceElevated : 'rgba(248,250,252,0.85)',
                                    borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.65)',
                                  },
                                ]}
                              >
                                <View style={styles.tripsRouteSide}>
                                  <Text style={[styles.tripsRouteLabel, { color: colors.textMuted }]}>Origin</Text>
                                  <Text style={[styles.tripsRouteValue, { color: colors.text }]} numberOfLines={1}>
                                    {item.from}
                                  </Text>
                                </View>
                                <View style={styles.tripsRouteMiddle}>
                                  <View style={[styles.tripsRouteDot, { backgroundColor: colors.emerald }]} />
                                  <View style={[styles.tripsRouteLine, { backgroundColor: colors.border }]} />
                                  <View style={[styles.tripsRouteDot, { backgroundColor: colors.textMuted }]} />
                                </View>
                                <View style={[styles.tripsRouteSide, styles.tripsRouteSideRight]}>
                                  <Text style={[styles.tripsRouteLabel, { color: colors.textMuted }]}>Destination</Text>
                                  <Text style={[styles.tripsRouteValue, { color: colors.text }]} numberOfLines={1}>
                                    {item.to}
                                  </Text>
                                </View>
                              </View>
                            </TouchableOpacity>

                            {isExpanded && (
                              <View style={styles.tripsExpanded}>
                                {isActionRequired && (
                                  <View
                                    style={[
                                      styles.tripsAttention,
                                      {
                                        backgroundColor: 'rgba(249,115,22,0.10)',
                                        borderColor: 'rgba(249,115,22,0.22)',
                                      },
                                    ]}
                                  >
                                    <View style={styles.tripsAttentionLeft}>
                                      <FontAwesome name="exclamation-circle" size={16} color={'rgb(249,115,22)'} />
                                      <View style={styles.tripsAttentionText}>
                                        <Text style={styles.tripsAttentionLabel}>Attention needed</Text>
                                        <Text style={[styles.tripsAttentionValue, { color: colors.text }]} numberOfLines={1}>
                                          {item.subStatus}
                                        </Text>
                                      </View>
                                    </View>
                                    <FontAwesome name="info-circle" size={16} color={'rgba(249,115,22,0.65)'} />
                                  </View>
                                )}

                                {isSettled ? (
                                  <>
                                    <TouchableOpacity
                                      activeOpacity={0.88}
                                      style={[
                                        styles.tripsReceiptButton,
                                        {
                                          backgroundColor: isDark ? colors.surfaceElevated : 'rgba(248,250,252,0.7)',
                                          borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.8)',
                                        },
                                      ]}
                                      onPress={() => setExpandedTripReceiptId((prev) => (prev === tripId ? null : tripId))}
                                    >
                                      <View style={styles.tripsReceiptButtonLeft}>
                                        <FontAwesome name="file-text-o" size={14} color={colors.textMuted} />
                                        <Text style={[styles.tripsReceiptButtonText, { color: colors.textMuted }]}>View receipt</Text>
                                      </View>
                                      <FontAwesome name={receiptExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
                                    </TouchableOpacity>

                                    {receiptExpanded && (
                                      <View style={styles.tripsReceiptCardWrap}>
                                        <View
                                          style={[
                                            styles.tripsReceiptCard,
                                            { backgroundColor: colors.surface, borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.9)' },
                                          ]}
                                        >
                                          <View style={styles.tripsReceiptHero}>
                                            <View style={[styles.tripsReceiptIcon, { backgroundColor: 'rgba(4,120,87,0.12)' }]}>
                                              <FontAwesome name="check" size={20} color={colors.emerald} />
                                            </View>
                                            <Text style={[styles.tripsReceiptEyebrow, { color: colors.emerald }]}>SETTLEMENT RECEIVED</Text>
                                            <Text style={[styles.tripsReceiptAmount, { color: colors.text }]}>₹{Math.round(item.amount).toLocaleString('en-IN')}</Text>
                                          </View>

                                          <View style={[styles.tripsReceiptMeta, { borderTopColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.9)' }]}>
                                            {[
                                              { k: 'Transaction ID', v: String(settlementTxnId) },
                                              { k: 'UTR', v: String(settlementUtr) },
                                              { k: 'Payment mode', v: String(settlementMode) },
                                              { k: 'Captured at', v: String(settlementCapturedAt) },
                                              { k: 'Reference', v: item.id },
                                              { k: 'Settled to', v: providerShort },
                                            ].map((r) => (
                                              <View key={r.k} style={styles.tripsReceiptMetaRow}>
                                                <Text style={[styles.tripsReceiptMetaLabel, { color: colors.textMuted }]}>{r.k}</Text>
                                                <Text style={[styles.tripsReceiptMetaValue, { color: colors.text }]} numberOfLines={1} ellipsizeMode="middle">
                                                  {r.v}
                                                </Text>
                                              </View>
                                            ))}
                                            <View style={styles.tripsReceiptMetaRow}>
                                              <Text style={[styles.tripsReceiptMetaLabel, { color: colors.textMuted }]}>Route</Text>
                                              <Text style={[styles.tripsReceiptMetaValue, { color: colors.text }]} numberOfLines={1}>
                                                {settlementRoute}
                                              </Text>
                                            </View>
                                          </View>

                                          <View style={styles.tripsReceiptActions}>
                                            <TouchableOpacity
                                              activeOpacity={0.85}
                                              style={[
                                                styles.tripsReceiptActionSecondary,
                                                {
                                                  backgroundColor: isDark ? colors.surfaceElevated : '#f8fafc',
                                                  borderColor: isDark ? colors.borderSubtle : '#e2e8f0',
                                                },
                                              ]}
                                              onPress={() => {
                                                const msg = buildSettlementShareMessage({
                                                  fleetName: providerShort,
                                                  tripId: item.id,
                                                  amount: Math.round(item.amount),
                                                  transactionId: String(settlementTxnId),
                                                  utr: String(settlementUtr),
                                                });
                                                Share.share({ message: msg }).catch(() => {});
                                              }}
                                            >
                                              <FontAwesome name="share-square-o" size={13} color={colors.textMuted} />
                                              <Text style={[styles.tripsReceiptActionSecondaryText, { color: colors.textMuted }]}>Share</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                              activeOpacity={0.85}
                                              style={[styles.tripsReceiptActionPrimary, { backgroundColor: colors.emerald }]}
                                              onPress={() =>
                                                shareTripSettlementPdf({
                                                  fleetName: providerShort,
                                                  displayId: item.id,
                                                  amount: Math.round(item.amount),
                                                  transactionId: String(settlementTxnId),
                                                  utr: String(settlementUtr),
                                                  paymentMode: String(settlementMode),
                                                  capturedAt: String(settlementCapturedAt),
                                                  route: settlementRoute,
                                                }).catch(() => {})
                                              }
                                            >
                                              <FontAwesome name="file-pdf-o" size={13} color={colors.textOnPrimary} />
                                              <Text style={styles.tripsReceiptActionPrimaryText}>PDF receipt</Text>
                                            </TouchableOpacity>
                                          </View>
                                        </View>
                                      </View>
                                    )}
                                  </>
                                ) : hasFleetPending ? (
                                  <View style={styles.tripsExpandedGrid}>
                                    <TouchableOpacity
                                      activeOpacity={0.88}
                                      style={[
                                        styles.tripsReceiptButton,
                                        {
                                          backgroundColor: isDark ? colors.surfaceElevated : 'rgba(248,250,252,0.7)',
                                          borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.8)',
                                        },
                                      ]}
                                      onPress={() =>
                                        setExpandedTripReceiptId((prev) => (prev === tripId ? null : tripId))
                                      }
                                    >
                                      <View style={styles.tripsReceiptButtonLeft}>
                                        <FontAwesome name="file-text-o" size={14} color={colors.textMuted} />
                                        <Text style={[styles.tripsReceiptButtonText, { color: colors.textMuted }]}>View fleet payment</Text>
                                      </View>
                                      <FontAwesome
                                        name={receiptExpanded ? 'chevron-up' : 'chevron-down'}
                                        size={14}
                                        color={colors.textMuted}
                                      />
                                    </TouchableOpacity>

                                    {receiptExpanded && (
                                      <View style={styles.tripsReceiptCardWrap}>
                                        <View
                                          style={[
                                            styles.tripsReceiptCard,
                                            { backgroundColor: colors.surface, borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.9)' },
                                          ]}
                                        >
                                          <View style={styles.tripsReceiptHero}>
                                            <View style={[styles.tripsReceiptIcon, { backgroundColor: 'rgba(249,115,22,0.12)' }]}>
                                              <FontAwesome name="check" size={20} color={'rgb(249,115,22)'} />
                                            </View>
                                            <Text style={[styles.tripsReceiptEyebrow, { color: 'rgb(249,115,22)' }]}>FLEET MARKED PAID</Text>
                                            <Text style={[styles.tripsReceiptAmount, { color: colors.text }]}>
                                              ₹{Math.round(item.amount).toLocaleString('en-IN')}
                                            </Text>
                                          </View>

                                          <View style={[styles.tripsReceiptMeta, { borderTopColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.9)' }]}>
                                            {[
                                              { k: 'Transaction ID', v: String(pendingTxnId) },
                                              { k: 'UTR', v: String(pendingUtr) },
                                              { k: 'Payment mode', v: String(pendingMode) },
                                              { k: 'Captured at', v: String(pendingCapturedAt) },
                                              { k: 'Reference', v: item.id },
                                              { k: 'Marked by', v: providerShort },
                                            ].map((r) => (
                                              <View key={r.k} style={styles.tripsReceiptMetaRow}>
                                                <Text style={[styles.tripsReceiptMetaLabel, { color: colors.textMuted }]}>{r.k}</Text>
                                                <Text style={[styles.tripsReceiptMetaValue, { color: colors.text }]} numberOfLines={1} ellipsizeMode="middle">
                                                  {r.v}
                                                </Text>
                                              </View>
                                            ))}
                                          </View>

                                          <View style={styles.tripsReceiptActions}>
                                            <TouchableOpacity
                                              activeOpacity={0.85}
                                              style={[
                                                styles.tripsReceiptActionSecondary,
                                                {
                                                  backgroundColor: isDark ? colors.surfaceElevated : '#f8fafc',
                                                  borderColor: isDark ? colors.borderSubtle : '#e2e8f0',
                                                },
                                              ]}
                                              onPress={() => {
                                                const msg = buildSettlementShareMessage({
                                                  fleetName: providerShort,
                                                  tripId: item.id,
                                                  amount: Math.round(item.amount),
                                                  transactionId: String(pendingTxnId),
                                                  utr: String(pendingUtr),
                                                });
                                                Share.share({ message: msg }).catch(() => {});
                                              }}
                                            >
                                              <FontAwesome name="share-square-o" size={13} color={colors.textMuted} />
                                              <Text style={[styles.tripsReceiptActionSecondaryText, { color: colors.textMuted }]}>Share</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                              activeOpacity={0.85}
                                              style={[styles.tripsReceiptActionPrimary, { backgroundColor: colors.emerald }]}
                                              onPress={() => confirmMarkAsPaid(item.trip, item.amount, fleetPendingLedger)}
                                            >
                                              <FontAwesome name="check" size={13} color={colors.textOnPrimary} />
                                              <Text style={styles.tripsReceiptActionPrimaryText}>Verify & Mark as paid</Text>
                                            </TouchableOpacity>
                                          </View>
                                        </View>
                                      </View>
                                    )}
                                  </View>
                                ) : (
                                  <View style={styles.tripsExpandedGrid}>
                                    <TouchableOpacity
                                      activeOpacity={0.88}
                                      onPress={() =>
                                        claimTripInAppAndShare({
                                          trip: item.trip,
                                          displayId: item.id,
                                          fleetName: providerShort,
                                          amount: item.amount,
                                          from: item.from,
                                          to: item.to,
                                          status: item.subStatus || item.status,
                                        }).catch(() => {})
                                      }
                                      disabled={requestPaymentLoadingTripId === item.trip.id}
                                      style={[styles.tripsClaimButton, { backgroundColor: '#0f172a' }]}
                                      accessibilityLabel="Request payment: save request, share PDF with fleet, optional WhatsApp"
                                    >
                                      <View style={styles.tripsClaimButtonInner}>
                                        <FontAwesome
                                          name={requestPaymentLoadingTripId === item.trip.id ? 'spinner' : 'whatsapp'}
                                          size={15}
                                          color="#25D366"
                                        />
                                        <Text style={[styles.tripsClaimButtonText, styles.tripsRequestPaymentButtonText]}>
                                          {requestPaymentLoadingTripId === item.trip.id
                                            ? 'REQUESTING…'
                                            : 'REQUEST FOR PAYMENT'}
                                        </Text>
                                      </View>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                      activeOpacity={0.88}
                                      onPress={() => confirmMarkAsPaid(item.trip, item.amount)}
                                      style={[
                                        styles.tripsMarkPaidButton,
                                        {
                                          backgroundColor: isDark ? colors.surfaceElevated : '#ffffff',
                                          borderColor: isDark ? colors.borderSubtle : 'rgba(226,232,240,0.9)',
                                        },
                                      ]}
                                      disabled={markPaidLoadingTripId === item.trip.id}
                                    >
                                      <FontAwesome
                                        name={markPaidLoadingTripId === item.trip.id ? 'spinner' : 'check'}
                                        size={14}
                                        color={colors.emerald}
                                      />
                                      <Text style={[styles.tripsMarkPaidButtonText, { color: colors.textMuted }]}>
                                        {markPaidLoadingTripId === item.trip.id ? 'SAVING…' : 'MARK AS PAID'}
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.ledgerSection, { paddingHorizontal: 12 }]}>
          <Text style={[styles.transactionHistoryTitle, { color: colors.text }]}>Cash settlements</Text>
          {filteredCashSections.length === 0 ? (
            <View style={[styles.ledgerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.ledgerEmpty, { borderBottomWidth: 0 }]}>
                <FontAwesome name="search" size={32} color={colors.textMuted} />
                <Text style={[styles.ledgerEmptyText, { color: colors.textMuted }]}>No settlements found</Text>
              </View>
            </View>
          ) : (
            <View style={styles.cashPremiumWrap}>
              {filteredCashSections.map(({ sectionLabel, trips }) => (
                <View key={sectionLabel} style={styles.cashPremiumSection}>
                  <Text style={[styles.cashPremiumSectionLabel, { color: colors.textMuted }]}>{sectionLabel}</Text>
                  <View
                    style={[
                      styles.cashPremiumGroup,
                      {
                        backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.62)',
                        borderColor: isDark ? colors.borderSubtle : 'rgba(255,255,255,0.85)',
                      },
                    ]}
                  >
                    {trips.map((trip, idx) => {
                      const routeSummary = [trip.pickup_area?.trim(), trip.drop_location?.trim()]
                        .filter(Boolean)
                        .join(' → ');
                      const tripRef = tripsService.getTripDisplayNumber(trip);
                      const receivedAmt = receivedByTripId[trip.id] ?? 0;
                      const listDivider = isDark ? colors.borderSubtle : Theme.borderMedium;
                      const isLastTrip = idx === trips.length - 1;
                      const txnExpanded = expandedTripId === `cash-${trip.id}`;
                      const fleetName =
                        salaryRequestOrgOptions.find((o) => String(o.orgId ?? '') === String(trip.organization_id ?? ''))?.orgName ?? 'Fleet';
                      const fleetAvatarUri = getFleetAvatarUriForOrg(
                        String(trip.organization_id ?? ''),
                        fleetName,
                      );
                      const ledger = latestCreditLedgerByTripId[trip.id];
                      const paymentMode = derivePaymentMode(ledger?.description) ?? '—';
                      const utr = extractUtr(ledger?.description) ?? '—';
                      const capturedAt = phonePeMetaDate(ledger?.created_at ?? trip.completed_at ?? trip.updated_at ?? trip.created_at);
                      const txnId = ledger?.id ?? tripRef;
                      return (
                        <View
                          key={trip.id}
                          style={[
                            styles.cashPremiumRow,
                            !isLastTrip && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: listDivider },
                          ]}
                        >
                          <TouchableOpacity
                            style={styles.cashPremiumRowTouch}
                            activeOpacity={0.8}
                            onPress={() => setExpandedTripId((prev) => (prev === `cash-${trip.id}` ? null : `cash-${trip.id}`))}
                          >
                              <View style={styles.cashPremiumLeft}>
                              <View
                                style={[
                                  styles.cashPremiumAvatar,
                                  { backgroundColor: isDark ? colors.surfaceElevated : 'rgba(248,250,252,0.92)' },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.cashPremiumAvatarImageClip,
                                    {
                                      borderColor: 'rgba(226,232,240,0.7)',
                                      backgroundColor: isDark ? colors.surfaceElevated : 'rgba(248,250,252,0.92)',
                                    },
                                  ]}
                                >
                                  <Image
                                    source={{ uri: fleetAvatarUri }}
                                    style={styles.cashPremiumAvatarImage}
                                    resizeMode="cover"
                                  />
                                </View>
                                <View style={[styles.cashPremiumAvatarBadge, { backgroundColor: colors.surface }]}>
                                  <FontAwesome name="arrow-down" size={10} color={colors.emerald} />
                                </View>
                              </View>
                              <View style={styles.cashPremiumBody}>
                                <Text style={[styles.cashPremiumSource, { color: colors.text }]} numberOfLines={1}>
                                  {fleetName}
                                </Text>
                                <Text style={[styles.cashPremiumMethod, { color: colors.textMuted }]} numberOfLines={1}>
                                  {tripRef} • {phonePeMetaDate(trip.completed_at ?? trip.updated_at ?? trip.created_at)}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.cashPremiumRightWrap}>
                              <View style={styles.cashPremiumRight}>
                                <Text style={[styles.cashPremiumAmount, { color: colors.emerald }]}>
                                  +₹{receivedAmt.toLocaleString('en-IN')}
                                </Text>
                                <View style={styles.cashPremiumStatusRow}>
                                  <FontAwesome name="check-circle" size={10} color={colors.emerald} />
                                  <Text style={[styles.cashPremiumStatus, { color: colors.textMuted }]}>SUCCESS</Text>
                                </View>
                              </View>
                              <FontAwesome
                                name="chevron-down"
                                size={16}
                                color={colors.textMuted}
                                style={txnExpanded ? styles.cashPremiumChevronExpanded : undefined}
                              />
                            </View>
                          </TouchableOpacity>

                          {txnExpanded && (
                            <View style={styles.cashPremiumReceiptWrap}>
                              <View
                                style={[
                                  styles.cashPremiumReceiptCard,
                                  {
                                    backgroundColor: colors.surface,
                                    borderColor: isDark ? colors.borderSubtle : '#e2e8f0',
                                  },
                                ]}
                              >
                                <View style={styles.cashPremiumReceiptHero}>
                                  <View style={[styles.cashPremiumReceiptIcon, { backgroundColor: colors.emeraldMuted }]}>
                                    <FontAwesome name="check" size={22} color={colors.emerald} />
                                  </View>
                                  <Text style={[styles.cashPremiumReceiptEyebrow, { color: colors.emerald }]}>SETTLEMENT RECEIVED</Text>
                                  <Text style={[styles.cashPremiumReceiptAmount, { color: colors.text }]}>₹{receivedAmt.toLocaleString('en-IN')}</Text>
                                </View>

                                <View style={[styles.cashPremiumReceiptMeta, { borderTopColor: isDark ? colors.borderSubtle : '#e2e8f0' }]}>
                                  <View style={styles.cashPremiumReceiptMetaRow}>
                                    <Text style={[styles.cashPremiumReceiptMetaLabel, { color: colors.textMuted }]}>Transaction ID</Text>
                                  <Text
                                    style={[styles.cashPremiumReceiptMetaValue, { color: colors.text }]}
                                    numberOfLines={1}
                                    ellipsizeMode="middle"
                                  >
                                    {txnId}
                                  </Text>
                                  </View>
                                  <View style={styles.cashPremiumReceiptMetaRow}>
                                  <Text style={[styles.cashPremiumReceiptMetaLabel, { color: colors.textMuted }]}>UTR</Text>
                                  <Text
                                    style={[styles.cashPremiumReceiptMetaValue, { color: colors.text }]}
                                    numberOfLines={1}
                                    ellipsizeMode="middle"
                                  >
                                    {utr}
                                  </Text>
                                  </View>
                                  <View style={styles.cashPremiumReceiptMetaRow}>
                                  <Text style={[styles.cashPremiumReceiptMetaLabel, { color: colors.textMuted }]}>Payment mode</Text>
                                  <Text style={[styles.cashPremiumReceiptMetaValue, { color: colors.text }]} numberOfLines={1}>
                                    {paymentMode}
                                  </Text>
                                </View>
                                <View style={styles.cashPremiumReceiptMetaRow}>
                                  <Text style={[styles.cashPremiumReceiptMetaLabel, { color: colors.textMuted }]}>Captured at</Text>
                                  <Text style={[styles.cashPremiumReceiptMetaValue, { color: colors.text }]} numberOfLines={1}>
                                    {capturedAt}
                                  </Text>
                                </View>
                                <View style={styles.cashPremiumReceiptMetaRow}>
                                  <Text style={[styles.cashPremiumReceiptMetaLabel, { color: colors.textMuted }]}>Reference</Text>
                                  <Text
                                    style={[styles.cashPremiumReceiptMetaValue, { color: colors.text }]}
                                    numberOfLines={1}
                                    ellipsizeMode="middle"
                                  >
                                    {tripRef}
                                  </Text>
                                </View>
                                <View style={styles.cashPremiumReceiptMetaRow}>
                                  <Text style={[styles.cashPremiumReceiptMetaLabel, { color: colors.textMuted }]}>Settled to</Text>
                                    <View style={styles.cashPremiumReceiptBankRow}>
                                      <FontAwesome name="university" size={12} color={colors.textMuted} />
                                    <Text
                                      style={[styles.cashPremiumReceiptMetaValue, { color: colors.text }]}
                                      numberOfLines={1}
                                      ellipsizeMode="tail"
                                    >
                                      {fleetName}
                                    </Text>
                                    </View>
                                  </View>
                                  {routeSummary ? (
                                    <View style={styles.cashPremiumReceiptMetaRow}>
                                      <Text style={[styles.cashPremiumReceiptMetaLabel, { color: colors.textMuted }]}>Route</Text>
                                      <Text style={[styles.cashPremiumReceiptMetaValue, { color: colors.text }]} numberOfLines={1}>
                                        {routeSummary}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>

                                <View style={styles.cashPremiumReceiptActions}>
                                  <TouchableOpacity
                                    style={[
                                      styles.cashPremiumReceiptButtonSecondary,
                                      {
                                        backgroundColor: isDark ? colors.surfaceElevated : '#f8fafc',
                                        borderColor: isDark ? colors.borderSubtle : '#e2e8f0',
                                      },
                                    ]}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                      const msg = buildSettlementShareMessage({
                                        fleetName,
                                        tripId: tripRef,
                                        amount: receivedAmt,
                                        transactionId: String(txnId),
                                        utr: String(utr),
                                      });
                                      Share.share({ message: msg }).catch(() => {});
                                    }}
                                  >
                                    <FontAwesome name="share-square-o" size={13} color={colors.textMuted} />
                                    <Text style={[styles.cashPremiumReceiptButtonSecondaryText, { color: colors.textMuted }]}>Share</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.cashPremiumReceiptButtonPrimary, { backgroundColor: colors.emerald }]}
                                    activeOpacity={0.85}
                                    onPress={() =>
                                      shareCashReceiptPdf({
                                        title: 'SETTLEMENT RECEIVED',
                                        amount: receivedAmt,
                                        transactionId: String(txnId ?? '—'),
                                        utr: String(utr ?? '—'),
                                        paymentMode: String(paymentMode ?? '—'),
                                        capturedAt: String(capturedAt ?? '—'),
                                        reference: String(tripRef ?? '—'),
                                        settledTo: String(fleetName ?? '—'),
                                        route: routeSummary || null,
                                      }).catch((e) => {
                                        const message = e instanceof Error ? e.message : 'Could not generate receipt.';
                                        if (Platform.OS === 'web') window.alert(message);
                                        else Alert.alert('Receipt failed', message);
                                      })
                                    }
                                  >
                                    <FontAwesome name="file-pdf-o" size={13} color={colors.textOnPrimary} />
                                    <Text style={styles.cashPremiumReceiptButtonPrimaryText}>PDF receipt</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
    <ThemedConfirmModal
      variant="positive"
      visible={!!markPaidConfirmState}
      title={markPaidConfirmState?.sourceLedger ? 'Verify & Mark as paid' : 'Mark as paid'}
      message={
        markPaidConfirmState
          ? (() => {
              const tripDisplay = tripsService.getTripDisplayNumber(markPaidConfirmState.trip);
              const amountStr = `₹${Math.round(markPaidConfirmState.amount).toLocaleString('en-IN')}`;
              const sourceDesc = markPaidConfirmState.sourceLedger?.description ?? null;
              if (!sourceDesc) {
                return `Record ${amountStr} for ${tripDisplay} as received? This will update your cash balance.`;
              }
              const utr = extractUtr(sourceDesc) ?? '—';
              const mode = derivePaymentMode(sourceDesc) ?? '—';
              return `Verify fleet marked payment for ${tripDisplay}: ${amountStr} (Mode: ${mode}, UTR: ${utr}). This will update your cash balance.`;
            })()
          : ''
      }
      cancelText="Cancel"
      confirmText={markPaidLoadingTripId && markPaidConfirmState ? 'Saving...' : 'Proceed'}
      confirmVariant="primary"
      onCancel={() => {
        if (!markPaidLoadingTripId) setMarkPaidConfirmState(null);
      }}
      onConfirm={() => {
        const next = markPaidConfirmState;
        if (!next) return;
        setMarkPaidConfirmState(null);
        void markTripAsPaid(next.trip, next.amount, next.sourceLedger ?? null);
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.driverBackground,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.driverBackground,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.driverHeaderHorizontalPadding,
    paddingBottom: Layout.driverHeaderBottomPadding,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.driverHeaderGap,
    flex: 1,
    minWidth: 0,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  passbookHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  passbookHeaderBtnText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  avatarBtn: { padding: 2 },
  avatarCircle: {
    width: Layout.driverHeaderAvatarSize,
    height: Layout.driverHeaderAvatarSize,
    borderRadius: Layout.driverHeaderAvatarSize / 2,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: Layout.driverHeaderAvatarSize / 2,
  },
  brand: {
    ...Typography.headerSubtitle,
    marginBottom: 1,
  },
  welcomeTitle: {
    ...Typography.headerTitle,
    textTransform: 'none',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  creditsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  creditsTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  creditsSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  walletCardWrap: {
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  walletCard: {
    borderRadius: 28,
    paddingVertical: 26,
    paddingHorizontal: 56,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  walletCardWatermarkWrap: {
    position: 'absolute',
    top: 4,
    right: -8,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  walletCardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 4,
  },
  walletCardContent: {
    width: '100%',
    alignItems: 'center',
  },
  walletCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 4,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  walletCardSublabel: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.4,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  walletCardBalanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    paddingHorizontal: 18,
  },
  walletCardBalanceRupee: {
    fontSize: 48,
    fontWeight: '700',
    fontStyle: 'italic',
    lineHeight: 56,
    marginRight: -4,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  walletCardBalanceNumber: {
    flexShrink: 1,
    fontSize: 48,
    fontWeight: '700',
    fontStyle: 'italic',
    lineHeight: 56,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  walletCardBalanceNumberAndroid: {
    fontSize: 42,
    lineHeight: 50,
    includeFontPadding: true,
    paddingLeft: 2,
    paddingRight: 8,
    fontStyle: 'normal',
  },
  walletCardWithdrawBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  walletCardWithdrawText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.6,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  mainTabsWrap: {
    marginTop: 18,
    marginHorizontal: Layout.screenPaddingHorizontal,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 28,
    padding: 8,
    gap: 6,
    // Clip active-tab visual effects inside the segmented shell.
    overflow: 'hidden',
    // Keep container flat to avoid platform-specific shadow compositing artifacts.
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
  },
  mainTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 56,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  mainTabActive: {
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        // Prevent Android glow/ring artifact from nested elevation.
        elevation: 0,
      },
      default: {},
    }),
  },
  mainTabText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  searchSection: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 14,
    gap: 12,
  },
  filterChipRow: {
    gap: 10,
    paddingRight: 24,
  },
  filterChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 8,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  bulkClaimButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 26,
    elevation: 10,
  },
  bulkClaimButtonText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: Theme.textOnPrimary,
  },
  ledgerSection: {
    paddingTop: 16,
  },
  transactionHistoryTitle: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 2.2,
    marginBottom: 10,
  },
  fleetList: {
    gap: 18,
    paddingBottom: 24,
  },
  fleetCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
  },
  fleetCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  fleetCardTopRowNew: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 14,
  },
  fleetCardTopLeft: {
    flexDirection: 'row',
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  fleetCardLogo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fleetCardLogoNew: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  fleetCardLogoImage: {
    width: '100%',
    height: '100%',
  },
  fleetCardBody: {
    flex: 1,
    minWidth: 0,
  },
  fleetCardTitle: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  fleetMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fleetMetaText: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    flex: 1,
    minWidth: 0,
  },
  fleetTopRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  fleetStatusPillNew: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  fleetStatusTextNew: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2.2,
  },
  fleetMetaRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fleetMetaTextRight: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2.2,
  },
  fleetCardRateRow: {
    fontSize: 12,
    lineHeight: 17,
  },
  fleetStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  fleetStatusText: {
    fontSize: 10,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fleetStatsCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  fleetStatsGridNew: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  fleetStatBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: 'rgba(15,23,42,0.06)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 4,
  },
  fleetStatBoxWarning: {
    shadowColor: 'rgba(249,115,22,0.10)',
  },
  fleetStatBoxLabel: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2.2,
    marginBottom: 8,
  },
  fleetStatBoxValue: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.6,
  },
  fleetStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fleetStatLabel: {
    fontSize: 12,
    fontWeight: '400',
  },
  fleetStatValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  fleetPrimaryButton: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 20,
    elevation: 6,
  },
  fleetPrimaryButtonNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 999,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
    elevation: 10,
  },
  fleetPrimaryButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fleetPrimaryRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fleetPrimaryRingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  fleetPrimaryButtonText: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  fleetPrimaryButtonArrow: {
    opacity: 0.45,
  },
  referenceSectionWrap: {
    gap: 28,
    paddingBottom: 28,
  },
  tripsPremiumWrap: {
    gap: 28,
    paddingBottom: 28,
  },
  tripsPremiumSection: {
    gap: 12,
  },
  tripsSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 2,
  },
  tripsSectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 3,
    borderColor: Theme.driverBackground,
    shadowColor: 'rgba(4,120,87,0.45)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  tripsPremiumSectionLabel: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2,
    paddingHorizontal: 2,
  },
  tripsTimeline: {
    position: 'relative',
    paddingLeft: 0,
  },
  tripsTimelineLine: {
    display: 'none',
  },
  tripsTimelineList: {
    gap: 18,
  },
  tripsCard: {
    borderWidth: 1,
    borderRadius: 30,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  tripsCardExpanded: {
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 10,
  },
  tripsCardTouch: {
    padding: 20,
  },
  tripsCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  tripsCardTopLeft: {
    flexDirection: 'row',
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  tripsIcon: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tripsIconImage: {
    width: '100%',
    height: '100%',
  },
  tripsHeadText: {
    flex: 1,
    minWidth: 0,
  },
  tripsTripId: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  tripsMetaInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tripsMetaText: {
    fontSize: 9,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tripsMetaDot: {
    fontSize: 10,
    fontWeight: '400',
  },
  tripsCardRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  tripsAmount: {
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: -0.7,
  },
  tripsStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tripsStatusPill: {
    fontSize: 8,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tripsStatusWarning: {
    backgroundColor: '#ffedd5',
    color: '#ea580c',
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  tripsStatusInfo: {
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  tripsStatusSuccess: {
    backgroundColor: '#ecfdf5',
    color: Theme.driverEmerald,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  tripsChevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  tripsDebugSyncToken: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  tripsRouteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  tripsRouteSide: {
    flex: 1,
    minWidth: 0,
  },
  tripsRouteSideRight: {
    alignItems: 'flex-end',
  },
  tripsRouteLabel: {
    fontSize: 8,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    marginBottom: 4,
  },
  tripsRouteValue: {
    fontSize: 11,
    fontWeight: '400',
  },
  tripsRouteMiddle: {
    alignItems: 'center',
    width: 44,
  },
  tripsRouteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tripsRouteLine: {
    width: 1,
    height: 22,
    marginVertical: 2,
  },
  tripsExpanded: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226,232,240,0.7)',
    gap: 12,
  },
  tripsAttention: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripsAttentionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  tripsAttentionText: {
    flex: 1,
    minWidth: 0,
  },
  tripsAttentionLabel: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.7,
    color: '#9a3412',
    marginBottom: 2,
  },
  tripsAttentionValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  tripsExpandedGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  tripsMiniCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    justifyContent: 'space-between',
    minHeight: 68,
  },
  tripsShareCard: {
    justifyContent: 'center',
    gap: 10,
  },
  tripsMiniLabel: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.7,
    marginBottom: 8,
  },
  tripsCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tripsCopyText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  tripsClaimButton: {
    flex: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    minHeight: 68,
    shadowColor: 'rgba(15,23,42,0.35)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 10,
  },
  tripsClaimButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  tripsMarkPaidButton: {
    flex: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexDirection: 'row',
    minHeight: 68,
    borderWidth: 1,
    shadowColor: 'rgba(15,23,42,0.10)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 6,
  },
  tripsMarkPaidButtonText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.7,
  },
  tripsClaimButtonText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.7,
    color: Theme.textOnPrimary,
  },
  tripsRequestPaymentButtonText: {
    fontSize: 10,
    letterSpacing: 1.15,
    flexShrink: 1,
    textAlign: 'center',
  },
  tripsReceiptButton: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tripsReceiptButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tripsReceiptButtonText: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  tripsReceiptCardWrap: {
    paddingTop: 12,
  },
  tripsReceiptCard: {
    borderWidth: 1,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: 'rgba(4,120,87,0.18)',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 10,
  },
  tripsReceiptHero: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 18,
  },
  tripsReceiptIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  tripsReceiptEyebrow: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 6,
  },
  tripsReceiptAmount: {
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: -1,
  },
  tripsReceiptMeta: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 10,
  },
  tripsReceiptMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  tripsReceiptMetaLabel: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.7,
    minWidth: 128,
  },
  tripsReceiptMetaValue: {
    fontSize: 11,
    fontWeight: '400',
    textAlign: 'right',
    flexShrink: 1,
  },
  tripsReceiptActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
  },
  tripsReceiptActionSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tripsReceiptActionSecondaryText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  tripsReceiptActionPrimary: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tripsReceiptActionPrimaryText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Theme.textOnPrimary,
  },
  referenceSection: {
    gap: 14,
  },
  cashPremiumWrap: {
    gap: 28,
    paddingBottom: 28,
  },
  cashPremiumSection: {
    gap: 14,
  },
  cashPremiumSectionLabel: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2,
    paddingHorizontal: 2,
  },
  cashPremiumGroup: {
    borderWidth: 1,
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: 'rgba(15,23,42,0.12)',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 34,
    elevation: 8,
  },
  cashPremiumRow: {
    paddingHorizontal: 6,
  },
  cashPremiumRowTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  cashPremiumLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  cashPremiumAvatar: {
    width: 48,
    height: 48,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashPremiumAvatarImageClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cashPremiumAvatarImage: {
    width: '100%',
    height: '100%',
  },
  cashPremiumAvatarText: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  cashPremiumAvatarBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.7)',
    zIndex: 2,
    elevation: 4,
  },
  cashPremiumBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cashPremiumSource: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  cashPremiumMethod: {
    fontSize: 9,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  cashPremiumRight: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: 4,
  },
  cashPremiumRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 12,
  },
  cashPremiumAmount: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.4,
  },
  cashPremiumStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cashPremiumStatus: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.7,
  },
  cashPremiumChevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  cashPremiumReceiptWrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
    alignItems: 'center',
  },
  cashPremiumReceiptCard: {
    borderWidth: 1,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: 'rgba(4,120,87,0.18)',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 34,
    elevation: 10,
    width: '100%',
    maxWidth: 720,
  },
  cashPremiumReceiptHero: {
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 18,
  },
  cashPremiumReceiptIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cashPremiumReceiptEyebrow: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 6,
  },
  cashPremiumReceiptAmount: {
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: -1,
  },
  cashPremiumReceiptMeta: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 10,
  },
  cashPremiumReceiptMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cashPremiumReceiptMetaLabel: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.7,
    minWidth: 128,
  },
  cashPremiumReceiptMetaValue: {
    fontSize: 11,
    fontWeight: '400',
    textAlign: 'right',
    flexShrink: 1,
  },
  cashPremiumReceiptBankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  cashPremiumReceiptActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
  },
  cashPremiumReceiptButtonSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cashPremiumReceiptButtonSecondaryText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  cashPremiumReceiptButtonPrimary: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cashPremiumReceiptButtonPrimaryText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Theme.textOnPrimary,
  },
  referenceDateLabel: {
    fontSize: 8,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 2,
    paddingHorizontal: 2,
  },
  referenceTripList: {
    gap: 16,
  },
  referenceTripCard: {
    borderWidth: 1,
    borderRadius: 28,
    overflow: 'hidden',
  },
  referenceTripCardExpanded: {
    shadowColor: Theme.driverEmerald,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
  referenceTripTouch: {
    padding: 18,
  },
  referenceTripTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  referenceTripTopLeft: {
    flexDirection: 'row',
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  referenceTripIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referenceTripHeadText: {
    flex: 1,
    minWidth: 0,
  },
  referenceTripId: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  referenceTripMetaInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  referenceTripMetaText: {
    fontSize: 9,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  referenceTripMetaDot: {
    fontSize: 10,
    fontWeight: '400',
  },
  referenceTripRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  referenceTripAmount: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  referenceTripStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  referenceTripStatusPill: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  referenceTripStatusWarning: {
    backgroundColor: '#ffedd5',
    color: '#ea580c',
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  referenceTripStatusInfo: {
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  referenceTripStatusSuccess: {
    backgroundColor: '#ecfdf5',
    color: Theme.driverEmerald,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  referenceChevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  referenceRouteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  referenceRouteSide: {
    flex: 1,
    minWidth: 0,
  },
  referenceRouteSideRight: {
    alignItems: 'flex-end',
  },
  referenceRouteLabel: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    marginBottom: 4,
  },
  referenceRouteValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  referenceRouteMiddle: {
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  referenceRouteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  referenceRouteLine: {
    width: 1,
    height: 18,
    marginVertical: 2,
  },
  referenceExpanded: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226,232,240,0.7)',
  },
  referenceExpandedStatus: {
    marginTop: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  referenceExpandedStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  referenceExpandedStatusIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referenceExpandedStatusLabel: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  referenceExpandedStatusValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  referenceExpandedGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  referenceExpandedInfoCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  referenceExpandedInfoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    opacity: 0.55,
  },
  referenceExpandedInfoLabel: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  referenceExpandedCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  referenceExpandedCopyText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  referenceExpandedInfoValue: {
    fontSize: 12,
    fontWeight: '900',
  },
  referenceExpandedButton: {
    marginTop: 14,
    borderRadius: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  referenceExpandedButtonText: {
    color: Theme.textOnPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  referenceTransactionGroup: {
    borderWidth: 1,
    borderRadius: 28,
    overflow: 'hidden',
  },
  referenceCashRow: {
    paddingHorizontal: 0,
  },
  referenceCashRowTouch: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  referenceCashAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  referenceCashAvatarText: {
    fontSize: 16,
    fontWeight: '900',
  },
  referenceCashAvatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  referenceCashBody: {
    flex: 1,
    minWidth: 0,
  },
  referenceCashSource: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  referenceCashMethod: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  referenceCashRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  referenceCashAmount: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  referenceCashStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  referenceCashStatus: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  referenceCashReceiptWrap: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226,232,240,0.7)',
  },
  referenceCashReceiptCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
  },
  referenceCashReceiptHero: {
    alignItems: 'center',
    marginBottom: 18,
  },
  referenceCashReceiptIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  referenceCashReceiptEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  referenceCashReceiptAmount: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  referenceCashReceiptMeta: {
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 12,
  },
  referenceCashReceiptMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  referenceCashReceiptMetaLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  referenceCashReceiptMetaValue: {
    fontSize: 11,
    fontWeight: '800',
  },
  referenceCashReceiptBankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  referenceCashReceiptActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  referenceCashReceiptButtonSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  referenceCashReceiptButtonSecondaryText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  referenceCashReceiptButtonPrimary: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  referenceCashReceiptButtonPrimaryText: {
    color: Theme.textOnPrimary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  filterTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  filterTabPill: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabPillText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  filterSummaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 12,
  },
  filterSummaryTile: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  filterSummaryTilePending: {
    backgroundColor: '#991b1b',
  },
  filterSummaryTileReceived: {
    backgroundColor: '#065f46',
  },
  filterSummaryTileActive: {
    transform: [{ scale: 1.02 }],
  },
  filterSummaryWatermarkWrap: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '12deg' }],
  },
  filterSummaryWatermarkIcon: {
    opacity: 0.2,
  },
  filterSummaryContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  filterSummaryLabelOnDark: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
  },
  filterSummaryAmountOnDark: {
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 0.2,
    color: Theme.textOnPrimary,
  },
  filterSummaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  filterSummaryAmountPending: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: Theme.negative,
  },
  filterSummaryAmountReceived: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: Theme.driverEmerald,
  },
  filterScroll: {
    marginBottom: 8,
  },
  filterScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 24,
  },
  filterTab: {
    position: 'relative' as const,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  filterTabUnderline: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 4,
    height: 2,
    borderRadius: 1,
  },
  filterSummary: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 12,
  },
  ledgerTitle: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  ledgerCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ledgerEmpty: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  ledgerEmptyText: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.driverBorder,
    gap: 16,
  },
  ledgerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.driverEmerald,
    borderWidth: 1,
    borderColor: Theme.driverEmerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerIconWrapDebit: {
    backgroundColor: Theme.driverSurface,
  },
  ledgerDesc: { flex: 1 },
  ledgerDescText: {
    ...driverBodyPrimary,
    fontSize: 13,
    color: Theme.textOnDark,
  },
  ledgerDate: {
    ...driverBodySecondary,
    fontSize: 9,
    color: Theme.textMuted,
    marginTop: 2,
  },
  ledgerAmount: {
    fontSize: 15,
    fontWeight: '500',
    color: Theme.driverEmerald,
  },
  ledgerAmountDebit: {
    color: Theme.textMuted,
  },
  upiListWrap: {
    gap: 14,
    paddingBottom: 24,
  },
  upiSection: {
    gap: 6,
  },
  upiSectionHeader: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.15,
    paddingHorizontal: 0,
  },
  upiListBlock: {
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'visible',
    paddingVertical: 0,
  },
  /** PhonePe-style trip / ledger row */
  ppTxCard: {
    paddingVertical: 13,
    paddingHorizontal: 0,
  },
  ppPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  ppTxTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ppIconSq: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ppMiddle: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  ppPrimary: {
    ...driverBodyPrimary,
    fontSize: 14,
    flexShrink: 1,
  },
  txStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  txStatusPillText: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.25,
  },
  ppSecondary: {
    ...driverBodySecondary,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  ppAmount: {
    ...driverUISemiBold,
    fontSize: 12,
    letterSpacing: 0,
    flexShrink: 0,
    maxWidth: '40%',
    textAlign: 'right',
  },
  ppAmountAndroid: {
    includeFontPadding: true,
  },
  ppMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingLeft: 58,
    paddingRight: 2,
  },
  ppMetaLeft: {
    ...driverBodySecondary,
    fontSize: 10,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  ppMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    maxWidth: '52%',
    justifyContent: 'flex-end',
  },
  ppMetaRightText: {
    ...driverBodySecondary,
    fontSize: 10,
    textAlign: 'right',
    flexShrink: 1,
  },
  ppMetaBankIcon: {
    marginTop: 1,
  },
  dropdownWrap: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 16,
  },
  dropdownGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  dropdownCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  dropdownCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    opacity: 0.5,
  },
  dropdownCardLabel: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  dropdownCardValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  fareBreakdownWrap: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginTop: 16,
  },
  fareBreakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  fareBreakdownTitle: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyBtnText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  fareLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  fareValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  fareTotalRow: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  fareTotalLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fareTotalLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  fareTotalValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  dropdownActions: { flexDirection: 'row', marginTop: 18, gap: 12 },
  dropdownActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dropdownActionBtnText: { fontSize: 14, fontWeight: '400', letterSpacing: 0 },
  dropdownPrimaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dropdownPrimaryBtnText: { fontSize: 16, fontWeight: '500', letterSpacing: 0 },
  dropdownSecondaryRow: { flexDirection: 'row', gap: 12 },
  dropdownSecondaryBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 13,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dropdownSecondaryBtnText: { fontSize: 15, fontWeight: '400', letterSpacing: 0 },
  dropdownTrustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  dropdownTrustDot: { width: 4, height: 4, borderRadius: 2 },
  dropdownTrustText: { fontSize: 10, fontWeight: '500' },
  tripCard: {
    borderWidth: 0,
    borderRadius: 0,
    marginHorizontal: 0,
    marginVertical: 0,
    backgroundColor: 'transparent',
  },
  upiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  upiRowLast: {
    borderBottomWidth: 0,
  },
  upiRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upiRowIconStyle: {
    opacity: 0.39,
  },
  upiRowBody: {
    flex: 1,
    minWidth: 0,
  },
  upiRowTitle: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
  },
  upiRowSub: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 2,
    letterSpacing: 0,
  },
  upiRowRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  upiRowAmount: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0,
  },
  upiRowStatus: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  upiRowChevron: {
    marginLeft: 4,
  },
  upiExpandedPanel: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomWidth: 1,
  },
  upiExpandedCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: 'rgba(4,120,87,0.35)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  upiExpandedDetailRowTwoCol: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  upiExpandedDetailRowLast: {
    borderBottomWidth: 0,
  },
  upiExpandedDetailCell: {
    flex: 1,
    minWidth: 0,
  },
  upiExpandedDetailCellRight: {
    paddingLeft: 8,
  },
  upiExpandedLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  upiExpandedValue: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 19,
  },
  upiExpandedAmountValue: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0,
  },
  upiExpandedActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  upiExpandedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  upiExpandedBtnPrimary: {
    shadowColor: 'rgba(4,120,87,0.35)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  upiExpandedBtnSecondary: {
    borderWidth: 1,
  },
  upiExpandedBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  upiExpandedAdHocCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    paddingBottom: 4,
    borderTopWidth: 1,
    paddingHorizontal: 4,
  },
  upiExpandedAdHocIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upiExpandedAdHocTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  upiExpandedAdHocTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  upiExpandedAdHocBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  earningsListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 14,
  },
  earningsListRowLast: {
    borderBottomWidth: 0,
  },
  earningsListStatusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsListStatusIconWrapSettled: {
    backgroundColor: Theme.driverEmerald,
  },
  earningsListStatusIconWrapNotSettled: {
    backgroundColor: Theme.negative,
  },
  earningsListBody: {
    flex: 1,
    minWidth: 0,
  },
  earningsListHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  earningsListTripId: {
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
  earningsListRideBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  earningsListRideBadgeText: {
    fontSize: 10,
    fontWeight: '400',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  earningsListSubtext: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 4,
  },
  earningsListLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    minWidth: 0,
  },
  earningsListLocationIcon: {
    marginRight: 5,
  },
  earningsListLocation: {
    flex: 1,
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0.1,
  },
  earningsListRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  earningsListAmount: {
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  earningsCardStatusTagText: {
    fontSize: 10,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  tripBlock: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.driverBorder,
  },
  tripEarningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0,
    gap: 16,
  },
  receivedSubrowWrap: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    paddingLeft: 56,
    borderLeftWidth: 3,
    borderLeftColor: Theme.driverEmeraldBorderSoft ?? Theme.driverEmerald,
    marginLeft: 20,
    marginRight: 20,
    marginBottom: 4,
  },
  receivedSubrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ledgerIconWrapSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receivedLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  ledgerAmountSmall: {
    fontSize: 14,
    fontWeight: '500',
  },
  notReceivedLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
});
