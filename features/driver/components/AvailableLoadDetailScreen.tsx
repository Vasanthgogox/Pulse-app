/**
 * Phase A/B — load detail with a real Bid flow (submit_market_bid).
 */
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import {
  fleetOwnerLoadDisplayId,
  fleetOwnerLoadRouteLabel,
  formatFleetOwnerRateOffer,
  isLoadCompatibleWithFleet,
} from '@/features/driver/services/fleetOwnerLoads.service';
import {
  formatMarketBidAmount,
  marketBidStatusLabel,
  submitMarketBid,
} from '@/features/driver/services/marketBids.service';
import {
  ownerVehicleSubtitle,
  ownerVehicleTitle,
} from '@/features/driver/services/ownerVehicles.service';
import { useFleetOwnerOpenLoadsQuery } from '@/lib/queries/useFleetOwnerOpenLoadsQuery';
import { useMyMarketBidForIndentQuery } from '@/lib/queries/useMyMarketBidForIndentQuery';
import { useMyMarketBidsQuery } from '@/lib/queries/useMyMarketBidsQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { ROUTES } from '@/lib/routes';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AvailableLoadDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const params = useLocalSearchParams<{ indentId?: string | string[] }>();
  const raw = Array.isArray(params.indentId) ? params.indentId[0] : params.indentId;
  const indentId = raw?.trim() || '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const { loads, isLoading, error } = useFleetOwnerOpenLoadsQuery(uid);
  const { vehicles } = useOwnerVehiclesQuery(uid);
  const {
    bid: myBid,
    isLoading: bidLoading,
    invalidate: invalidateMyBid,
  } = useMyMarketBidForIndentQuery(indentId, uid);
  const { invalidate: invalidateMyBids } = useMyMarketBidsQuery(uid);

  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const load = useMemo(
    () => loads.find((l) => l.id === indentId) ?? null,
    [loads, indentId],
  );
  const compatible = useMemo(
    () =>
      load
        ? isLoadCompatibleWithFleet(
            load,
            vehicles.map((v) => v.vehicle_type),
          )
        : false,
    [load, vehicles],
  );
  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v.status === 'active'),
    [vehicles],
  );

  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';
  const inputBg = isDark ? colors.surfaceElevated : Theme.surfaceGray;
  const rate = load ? formatFleetOwnerRateOffer(load.rate_offer) : null;

  const handleSubmitBid = async () => {
    const amount = Number(amountText.replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setSubmitError('Enter a valid bid amount.');
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      const { error: bidError } = await submitMarketBid({
        indentId,
        amount,
        note,
        ownerVehicleId: vehicleId,
      });
      if (bidError) {
        setSubmitError(bidError.message);
        return;
      }
      setJustSubmitted(true);
      invalidateMyBid();
      invalidateMyBids();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader
        title="Load detail"
        subtitle="Market"
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(ROUTES.driverAvailableLoads())
        }
      />

      {isLoading || (!load && bidLoading) ? (
        <ActivityIndicator color={colors.emerald} style={{ marginTop: 40 }} />
      ) : error || !load ? (
        <View style={styles.gate}>
          <Text style={[styles.gateTitle, { color: colors.text }]}>
            {myBid?.status === 'accepted'
              ? 'Awarded to you'
              : myBid?.status === 'rejected'
                ? 'Not selected'
                : 'Load unavailable'}
          </Text>
          <Text style={[styles.gateBody, { color: colors.textMuted }]}>
            {error instanceof Error
              ? error.message
              : myBid?.status === 'accepted'
                ? 'This load was awarded to your bid. Find the trip under Awards.'
                : myBid?.status === 'rejected'
                  ? 'The business selected another bid for this load.'
                  : 'It may have closed or been awarded.'}
          </Text>
          {myBid?.status === 'accepted' ? (
            <Pressable
              onPress={() =>
                router.push(ROUTES.driverMarketAwards() as Parameters<typeof router.push>[0])
              }
              style={[styles.bidCta, { backgroundColor: Theme.buttonPrimary, borderColor: Theme.buttonPrimaryBorder }]}
            >
              <Text style={styles.bidCtaText}>View Awards</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
            paddingTop: 12,
            gap: 12,
          }}
        >
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            <Text style={[styles.eyebrow, { color: colors.emerald }]}>
              {fleetOwnerLoadDisplayId(load)} · OPEN
            </Text>
            <Text style={[styles.route, { color: colors.text }]}>
              {fleetOwnerLoadRouteLabel(load)}
            </Text>
            <Text style={[styles.rate, { color: Theme.warning }]}>
              {rate ?? 'Rate on request'}
            </Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {[
                load.vehicle_type?.trim() || 'Vehicle TBA',
                load.load_type?.trim() || null,
                load.pickup_date
                  ? new Date(load.pickup_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {load.creator_organization_name ? (
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                Posted by {load.creator_organization_name}
              </Text>
            ) : null}
            {compatible ? (
              <Text style={[styles.fit, { color: colors.emerald }]}>
                Compatible with a vehicle in My Fleet
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: cardBorder },
            ]}
          >
            {bidLoading ? (
              <ActivityIndicator color={colors.emerald} />
            ) : myBid || justSubmitted ? (
              <>
                <Text style={[styles.section, { color: colors.text }]}>Your bid</Text>
                <Text style={[styles.rate, { color: Theme.warning }]}>
                  {formatMarketBidAmount(myBid?.amount) || amountText}
                </Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  {myBid ? marketBidStatusLabel(myBid.status) : 'Submitted — awaiting the business.'}
                </Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  Winning still requires the business to accept your bid — the
                  Driver App never creates trips or indents directly.
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.section, { color: colors.text }]}>Bid</Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  Winning still requires the business to accept your bid — the
                  Driver App never creates trips or indents directly.
                </Text>

                <Text style={[styles.label, { color: colors.textMuted }]}>
                  Your amount
                </Text>
                <TextInput
                  value={amountText}
                  onChangeText={setAmountText}
                  placeholder={load.rate_offer ? String(load.rate_offer) : 'e.g. 18500'}
                  keyboardType="numeric"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    { color: colors.text, backgroundColor: inputBg, borderColor: cardBorder },
                  ]}
                />

                <Text style={[styles.label, { color: colors.textMuted, marginTop: 10 }]}>
                  Note (optional)
                </Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Anything the business should know"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={[
                    styles.input,
                    styles.noteInput,
                    { color: colors.text, backgroundColor: inputBg, borderColor: cardBorder },
                  ]}
                />

                {activeVehicles.length > 0 ? (
                  <>
                    <Text style={[styles.label, { color: colors.textMuted, marginTop: 10 }]}>
                      Vehicle (optional)
                    </Text>
                    <View style={styles.vehicleList}>
                      {activeVehicles.map((v) => {
                        const on = vehicleId === v.id;
                        return (
                          <Pressable
                            key={v.id}
                            onPress={() => setVehicleId(on ? null : v.id)}
                            style={[
                              styles.vehicleChip,
                              {
                                borderColor: on ? colors.emerald : cardBorder,
                                backgroundColor: on
                                  ? isDark
                                    ? colors.emeraldMuted
                                    : 'rgba(167,243,208,0.4)'
                                  : inputBg,
                              },
                            ]}
                          >
                            <Text style={[styles.vehicleTitle, { color: colors.text }]}>
                              {ownerVehicleTitle(v)}
                            </Text>
                            <Text style={[styles.vehicleSub, { color: colors.textMuted }]}>
                              {ownerVehicleSubtitle(v)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={[styles.hint, { color: colors.textMuted }]}>
                      {vehicleId ? 'Tap again to skip vehicle.' : 'No vehicle selected — that’s fine.'}
                    </Text>
                  </>
                ) : null}

                {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

                <Pressable
                  onPress={() => void handleSubmitBid()}
                  disabled={busy}
                  style={[
                    styles.bidCta,
                    {
                      backgroundColor: Theme.buttonPrimary,
                      borderColor: Theme.buttonPrimaryBorder,
                      opacity: busy ? 0.65 : 1,
                    },
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color={Theme.buttonPrimaryText} />
                  ) : (
                    <Text style={styles.bidCtaText}>Submit Bid</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gate: { padding: 20, gap: 8 },
  gateTitle: { fontSize: 17, fontWeight: '800' },
  gateBody: { fontSize: 13, lineHeight: 19 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  route: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  rate: { fontSize: 24, fontWeight: '800' },
  meta: { fontSize: 13, fontWeight: '600' },
  fit: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  section: { fontSize: 14, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19 },
  bidDisabled: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidDisabledText: { fontSize: 14, fontWeight: '700' },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    minHeight: 40,
  },
  noteInput: { minHeight: 64, textAlignVertical: 'top' },
  vehicleList: { gap: 8 },
  vehicleChip: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 2,
  },
  vehicleTitle: { fontSize: 12, fontWeight: '700' },
  vehicleSub: { fontSize: 10, fontWeight: '500' },
  hint: { fontSize: 11, fontWeight: '500', marginTop: 4 },
  error: { fontSize: 12, fontWeight: '600', color: Theme.negative, marginTop: 8 },
  bidCta: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidCtaText: { fontSize: 14, fontWeight: '700', color: Theme.buttonPrimaryText },
});
