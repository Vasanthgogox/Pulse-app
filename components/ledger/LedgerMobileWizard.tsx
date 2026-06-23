import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffectiveBottomInset } from "@/lib/safeAreaWeb";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronLeft,
  Search,
} from "lucide-react-native";

import { EntityAvatar } from "@/components/EntityAvatar";
import { SmartInput } from "@/components/mobile-input";
import {
  OperationalBottomActionBar,
  OperationalButton,
} from "@/components/operational";
import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import type { LedgerTripSettlementPreview } from "@/lib/ledgerTripSettlementPreview.util";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { partyMobileWizardStyles as shell } from "@/components/party/partyMobileWizardStyles";
import { LedgerReviewTicket } from "@/components/ledger/LedgerReviewTicket";
import { LedgerTripSettlementNote } from "@/components/ledger/LedgerTripSettlementNote";
import {
  isLedgerCashPaymentMode,
  LEDGER_PAYMENT_MODES,
  LedgerPaymentModeTile,
  LedgerPaymentTypeIcon,
} from "@/components/ledger/ledgerPaymentVisuals";

export type LedgerWizardStep =
  | "direction"
  | "amount"
  | "party"
  | "trip"
  | "paymentType"
  | "paymentMode"
  | "details"
  | "review";

export interface LedgerWizardPartyOption {
  id: string;
  name: string;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  entityType?: PartyEntityType;
  is_integrated?: boolean;
}

export interface LedgerWizardTripOption {
  id: string;
  trip_number: string;
  route_label?: string | null;
  trip_date?: string | null;
  client_name?: string | null;
  supplier_name?: string | null;
  /** Suggested settlement for current IN/OUT direction (party-scoped when applicable). */
  dueAmount?: number | null;
}

export interface LedgerPaymentTypeItem {
  key: string;
  label: string;
  kind: string;
  selected: boolean;
  onPress: () => void;
}

export interface LedgerMobileWizardProps {
  isEditMode: boolean;
  entryContextLabel?: string;
  type: "in" | "out";
  onTypeChange: (next: "in" | "out") => void;
  typeLocked?: boolean;
  amountStr: string;
  onAmountChange: (value: string) => void;
  amountPlaceholder: string;
  /** Numeric due for % quick-set when placeholder string is unavailable. */
  dueAmountInr?: number | null;
  partyId: string | null;
  onPartySelect: (id: string | null) => void;
  partyOptions: LedgerWizardPartyOption[];
  partyLocked: boolean;
  partyDisplayName?: string | null;
  partyAvatarUrl?: string | null;
  partyAvatarSeed?: string | null;
  partyEntityType?: PartyEntityType;
  partyIsIntegrated?: boolean;
  hidePartyStep?: boolean;
  submitting?: boolean;
  selectedTripId: string | null;
  onTripSelect: (id: string | null) => void;
  trips: LedgerWizardTripOption[];
  tripLocked: boolean;
  tripDisplay?: string | null;
  /** When true, pick trip before amount (party / entity context). */
  tripBeforeAmount?: boolean;
  /** Default trip list filter — entity flows use trips with outstanding due. */
  defaultTripDueFilter?: "all" | "has_due";
  paymentTypeItems: LedgerPaymentTypeItem[];
  showPaymentTypeStep: boolean;
  paymentModeId: string;
  onPaymentModeSelect: (id: string) => void;
  paymentReference: string;
  onPaymentReferenceChange: (value: string) => void;
  entryDate: string;
  onEntryDateChange: (iso: string) => void;
  reconRows: { label: string; value: string }[];
  canSubmit: boolean;
  onSubmit: () => void;
  onClose: () => void;
  stepError?: string | null;
  /** Changes when parent re-opens the flow — resets step index. */
  flowSessionKey?: string;
  compact?: boolean;
  /** Trip ledger lines for duplicate-avoidance preview on amount + review steps. */
  tripLedgerPreview?: LedgerTripSettlementPreview | null;
}

function parseAmount(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseDueAmount(placeholder: string): number {
  return parseAmount(placeholder || "0");
}

function resolveDueTotalInr(props: LedgerMobileWizardProps): number {
  const fromPlaceholder = parseDueAmount(props.amountPlaceholder);
  if (fromPlaceholder > 0) return fromPlaceholder;
  if (props.dueAmountInr != null && props.dueAmountInr > 0) return props.dueAmountInr;
  if (props.selectedTripId) {
    const trip = props.trips.find((t) => t.id === props.selectedTripId);
    if (trip?.dueAmount != null && trip.dueAmount > 0) return trip.dueAmount;
  }
  return 0;
}

function formatLedgerAmountValue(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const SETTLEMENT_PCTS = [40, 50, 60, 70, 80, 90] as const;
const FULL_SETTLEMENT_PCT = 100;

function buildSteps(props: LedgerMobileWizardProps): LedgerWizardStep[] {
  const steps: LedgerWizardStep[] = [];
  if (!props.typeLocked && !props.isEditMode) steps.push("direction");
  if (!props.partyLocked && !props.hidePartyStep) steps.push("party");

  if (props.tripBeforeAmount) {
    if (!props.tripLocked) steps.push("trip");
    steps.push("amount");
  } else {
    steps.push("amount");
    if (!props.tripLocked) steps.push("trip");
  }

  if (props.showPaymentTypeStep) steps.push("paymentType");
  steps.push("paymentMode", "details", "review");
  return steps;
}

function resolveInitialStepIndex(
  steps: LedgerWizardStep[],
  props: LedgerMobileWizardProps,
): number {
  if (props.isEditMode) {
    const review = steps.indexOf("review");
    return review >= 0 ? review : 0;
  }
  if (props.tripLocked && props.partyLocked && props.typeLocked) {
    const amountIdx = steps.indexOf("amount");
    if (amountIdx >= 0 && parseAmount(props.amountStr) <= 0) return amountIdx;
    const modeIdx = steps.indexOf("paymentMode");
    return modeIdx >= 0 ? modeIdx : amountIdx >= 0 ? amountIdx : 0;
  }
  if (props.partyLocked && props.typeLocked && !props.tripLocked) {
    const tripIdx = steps.indexOf("trip");
    if (tripIdx >= 0) return tripIdx;
  }
  return 0;
}

function stepMeta(step: LedgerWizardStep, props: LedgerMobileWizardProps) {
  switch (step) {
    case "direction":
      return {
        title: "Money in or out?",
        hint: "Choose whether you received cash or paid someone.",
      };
    case "amount": {
      const dueInr = resolveDueTotalInr(props);
      const settledOnTrip = props.tripLocked && dueInr <= 0;
      return {
        title: props.type === "in" ? "Amount received" : "Amount paid",
        hint: settledOnTrip
          ? props.type === "in"
            ? "Nothing due from the client on this trip."
            : "Nothing due to this party on this trip."
          : props.amountPlaceholder
            ? `Due: ₹${props.amountPlaceholder} — edit if needed`
            : "Enter the settlement amount.",
      };
    }
    case "party":
      return {
        title: "Who is this with?",
        hint: "Pick the customer, supplier, or driver.",
      };
    case "trip":
      return {
        title: "Which trip?",
        hint:
          props.defaultTripDueFilter === "has_due"
            ? "Trips with outstanding balance are shown first."
            : "Link this entry to a voyage (optional).",
      };
    case "paymentType":
      return {
        title: props.type === "in" ? "Payment type" : "Expense type",
        hint: "What kind of entry is this?",
      };
    case "paymentMode":
      return {
        title: "How was it paid?",
        hint: "UPI, FASTag, cash, or other.",
      };
    case "details":
      return {
        title: "Reference & date",
        hint: isLedgerCashPaymentMode(props.paymentModeId)
          ? "Confirm the entry date."
          : "Add UTR or reference if you have one.",
      };
    case "review":
      return {
        title: props.isEditMode ? "Review update" : "Review & save",
        hint: "Confirm before syncing to the ledger.",
      };
    default:
      return { title: "", hint: "" };
  }
}

function canAdvanceStep(step: LedgerWizardStep, props: LedgerMobileWizardProps): boolean {
  switch (step) {
    case "direction":
      return true;
    case "amount":
      return parseAmount(props.amountStr) > 0;
    case "party":
      return props.partyLocked || props.partyId != null;
    case "trip":
      return true;
    case "paymentType":
      return props.paymentTypeItems.some((item) => item.selected);
    case "paymentMode":
      return Boolean(props.paymentModeId);
    case "details":
      return true;
    case "review":
      return props.canSubmit;
    default:
      return false;
  }
}

function formatDueCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString("en-IN");
}

/** Footer FAB + hint — keep list scroll end above this on mobile web. */
const WIZARD_FOOTER_CLEARANCE = 88;

export const LedgerMobileWizard = memo(function LedgerMobileWizard(props: LedgerMobileWizardProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = useEffectiveBottomInset();
  const compact = props.compact !== false;
  const listBottomPad = bottomInset + WIZARD_FOOTER_CLEARANCE;
  const steps = useMemo(() => buildSteps(props), [props]);
  const [stepIndex, setStepIndex] = useState(() => resolveInitialStepIndex(steps, props));
  const [partySearch, setPartySearch] = useState("");
  const [tripSearch, setTripSearch] = useState("");
  const [tripDueFilter, setTripDueFilter] = useState<"all" | "has_due">(
    props.defaultTripDueFilter ?? "all",
  );
  const [selectedSettlementPct, setSelectedSettlementPct] = useState<number | null>(null);

  const dueTotalInr = useMemo(() => resolveDueTotalInr(props), [
    props.amountPlaceholder,
    props.dueAmountInr,
    props.selectedTripId,
    props.trips,
  ]);

  const amountPartyVisual = useMemo(() => {
    const fromOptions = props.partyId
      ? props.partyOptions.find((p) => p.id === props.partyId)
      : null;
    const name =
      props.partyDisplayName?.trim() ||
      fromOptions?.name?.trim() ||
      props.entryContextLabel?.trim() ||
      "Party";
    const entityType =
      props.partyEntityType ??
      fromOptions?.entityType ??
      (props.type === "in" ? "client" : "supplier");
    return {
      name,
      avatarUrl: props.partyAvatarUrl ?? fromOptions?.avatar_url ?? null,
      avatarSeed: props.partyAvatarSeed ?? fromOptions?.avatar_seed ?? null,
      entityType,
      isIntegrated: props.partyIsIntegrated ?? fromOptions?.is_integrated ?? false,
      contextLine:
        props.entryContextLabel?.trim() &&
        props.entryContextLabel.trim() !== name
          ? props.entryContextLabel.trim()
          : props.tripDisplay?.trim() || null,
    };
  }, [
    props.partyId,
    props.partyOptions,
    props.partyDisplayName,
    props.partyAvatarUrl,
    props.partyAvatarSeed,
    props.partyEntityType,
    props.partyIsIntegrated,
    props.entryContextLabel,
    props.tripDisplay,
    props.type,
  ]);

  const handleAmountChange = useCallback(
    (value: string) => {
      setSelectedSettlementPct(null);
      props.onAmountChange(value);
    },
    [props],
  );

  const applySettlementPct = useCallback(
    (pct: number) => {
      if (dueTotalInr <= 0) return;
      const value =
        pct >= FULL_SETTLEMENT_PCT
          ? dueTotalInr
          : Math.round((dueTotalInr * pct) / 100);
      setSelectedSettlementPct(pct >= FULL_SETTLEMENT_PCT ? FULL_SETTLEMENT_PCT : pct);
      props.onAmountChange(formatLedgerAmountValue(value));
    },
    [dueTotalInr, props],
  );

  const applyFullPayment = useCallback(() => {
    applySettlementPct(FULL_SETTLEMENT_PCT);
  }, [applySettlementPct]);

  const lastSessionKeyRef = useRef(props.flowSessionKey ?? "");
  useEffect(() => {
    const key = props.flowSessionKey ?? "";
    if (key === lastSessionKeyRef.current) return;
    lastSessionKeyRef.current = key;
    setStepIndex(resolveInitialStepIndex(steps, props));
    setTripDueFilter(props.defaultTripDueFilter ?? "all");
    setPartySearch("");
    setTripSearch("");
    setSelectedSettlementPct(null);
  }, [props.flowSessionKey, props.defaultTripDueFilter, steps, props]);

  const currentStep = steps[stepIndex] ?? "review";
  const { title, hint } = stepMeta(currentStep, props);
  const canAdvance = canAdvanceStep(currentStep, props);
  const accent = props.type === "in" ? Theme.darkGreen : Theme.teslaRed;

  const filteredParties = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    if (!q) return props.partyOptions;
    return props.partyOptions.filter((p) => p.name.toLowerCase().includes(q));
  }, [partySearch, props.partyOptions]);

  const tripsWithDueFilter = useMemo(() => {
    if (tripDueFilter === "all") return props.trips;
    return props.trips.filter((t) => (t.dueAmount ?? 0) > 0);
  }, [props.trips, tripDueFilter]);

  const filteredTrips = useMemo(() => {
    const q = tripSearch.trim().toLowerCase();
    if (!q) return tripsWithDueFilter;
    return tripsWithDueFilter.filter((t) => {
      const hay = [t.trip_number, t.route_label, t.client_name, t.supplier_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tripSearch, tripsWithDueFilter]);

  const handleBack = useCallback(() => {
    if (stepIndex <= 0) {
      props.onClose();
      return;
    }
    setStepIndex((i) => Math.max(0, i - 1));
  }, [stepIndex, props]);

  const handleAdvance = useCallback(() => {
    if (currentStep === "review") {
      if (props.canSubmit) props.onSubmit();
      return;
    }
    if (!canAdvance) return;
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  }, [canAdvance, currentStep, props, steps.length]);

  const handleTripPick = useCallback(
    (id: string | null) => {
      props.onTripSelect(id);
      if (!id || currentStep !== "trip") return;
      const trip = props.trips.find((t) => t.id === id);
      const amountIdx = steps.indexOf("amount");
      if (amountIdx < 0) return;
      if ((trip?.dueAmount ?? 0) > 0 || props.tripBeforeAmount) {
        setStepIndex(amountIdx);
      }
    },
    [currentStep, props, steps],
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterdayIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const entityTitle = props.isEditMode ? "Update ledger" : "Record payment";
  const advanceLabel =
    currentStep === "review"
      ? props.isEditMode
        ? "Update"
        : "Save"
      : "Continue";

  const renderDirection = () => (
    <View style={styles.choiceCol}>
      <Pressable
        style={[styles.directionCard, props.type === "in" && styles.directionCardActiveIn]}
        onPress={() => props.onTypeChange("in")}
      >
        <View style={[styles.directionIcon, { backgroundColor: "#dcfce7" }]}>
          <ArrowDownLeft size={22} color={Theme.darkGreen} strokeWidth={2.4} />
        </View>
        <View style={styles.directionTextCol}>
          <Text style={styles.directionTitle}>Cash in</Text>
          <Text style={styles.directionSub}>Received</Text>
        </View>
      </Pressable>
      <Pressable
        style={[styles.directionCard, props.type === "out" && styles.directionCardActiveOut]}
        onPress={() => props.onTypeChange("out")}
      >
        <View style={[styles.directionIcon, { backgroundColor: "#fee2e2" }]}>
          <ArrowUpRight size={22} color={Theme.teslaRed} strokeWidth={2.4} />
        </View>
        <View style={styles.directionTextCol}>
          <Text style={styles.directionTitle}>Cash out</Text>
          <Text style={styles.directionSub}>Paid</Text>
        </View>
      </Pressable>
    </View>
  );

  const renderSettlementPctDock = () => {
    if (dueTotalInr <= 0) return null;
    const fullActive = selectedSettlementPct === FULL_SETTLEMENT_PCT;
    return (
      <View style={styles.amountPctDock}>
        <Text style={styles.pctSectionLabelCentered}>Quick settlement</Text>
        <Pressable
          style={({ pressed }) => [
            styles.fullPayTile,
            fullActive && styles.fullPayTileActive,
            fullActive && { borderColor: accent },
            pressed && styles.pctTilePressed,
          ]}
          onPress={applyFullPayment}
          accessibilityRole="button"
          accessibilityLabel={`Full payment, ${formatINR(dueTotalInr)}`}
        >
          <Text style={[styles.fullPayLabel, fullActive && { color: accent }]}>
            Full payment
          </Text>
          <Text style={[styles.fullPayAmount, { color: accent }]}>
            {formatINR(dueTotalInr)}
          </Text>
        </Pressable>
        <Text style={styles.pctSubsectionLabel}>Or choose % of due</Text>
        <View style={styles.pctGrid}>
          {SETTLEMENT_PCTS.map((pct) => {
            const preview = Math.round((dueTotalInr * pct) / 100);
            const active = selectedSettlementPct === pct;
            return (
              <Pressable
                key={pct}
                style={({ pressed }) => [
                  styles.pctTile,
                  active && styles.pctTileActive,
                  pressed && styles.pctTilePressed,
                ]}
                onPress={() => applySettlementPct(pct)}
                accessibilityRole="button"
                accessibilityLabel={`${pct} percent, ${formatINR(preview)}`}
              >
                <Text style={[styles.pctTilePct, active && styles.pctTilePctActive]}>
                  {pct}%
                </Text>
                <Text
                  style={[styles.pctTileAmt, active && styles.pctTileAmtActive]}
                  numberOfLines={1}
                >
                  {formatINR(preview)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const renderAmount = () => {
    const isIn = props.type === "in";
    const dueLabel = isIn ? "Total receivable" : "Total payable";
    const payLinePrefix = isIn ? "Receiving from" : "Paying";

    return (
      <ScrollView
        style={styles.amountScroll}
        contentContainerStyle={styles.amountScrollContentCentered}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.amountHeroStack}>
          <View style={styles.amountAvatarRing}>
            <EntityAvatar
              name={amountPartyVisual.name}
              avatarUrl={amountPartyVisual.avatarUrl}
              avatarSeed={amountPartyVisual.avatarSeed}
              entityType={amountPartyVisual.entityType}
              isIntegrated={amountPartyVisual.isIntegrated}
              size={56}
              showIntegrationBadge={false}
            />
          </View>

          <Text style={styles.amountPayLine} numberOfLines={2}>
            {payLinePrefix}{" "}
            <Text style={styles.amountPayLineName}>{amountPartyVisual.name}</Text>
          </Text>

          {amountPartyVisual.contextLine ? (
            <Text style={styles.amountContextLineCentered} numberOfLines={2}>
              {amountPartyVisual.contextLine}
            </Text>
          ) : null}

          <View style={styles.amountHeroInputWrap}>
            <SmartInput
              type="currency"
              value={parseAmount(props.amountStr)}
              onChange={(_, numeric) => {
                handleAmountChange(formatLedgerAmountValue(numeric));
              }}
              label={isIn ? "Amount received" : "Amount paid"}
              submitLabel="Apply"
              variant="hero"
              heroAccentColor={accent}
              placeholder="0"
              required={false}
              validation={{ min: 0, max: 100000000 }}
            />
          </View>

          {props.tripLedgerPreview ? (
            <LedgerTripSettlementNote
              preview={props.tripLedgerPreview}
              enteredInr={parseAmount(props.amountStr)}
              compact
            />
          ) : dueTotalInr > 0 ? (
            <View style={styles.amountDueChip}>
              <Text style={styles.amountDueChipLabel}>{dueLabel}</Text>
              <Text style={[styles.amountDueChipValue, { color: accent }]}>
                {formatINR(dueTotalInr)}
              </Text>
            </View>
          ) : props.tripLocked ? (
            <View style={styles.amountSettledChip}>
              <Text style={styles.amountSettledChipTitle}>Nothing due</Text>
              <Text style={styles.amountSettledChipSub}>
                {isIn
                  ? "This trip has no outstanding client balance. You can still record a payment or correction."
                  : "This trip has no outstanding balance for this party. You can still record a payout or correction."}
              </Text>
            </View>
          ) : (
            <Text style={styles.amountMetaHintCentered}>
              Enter the settlement amount for this entry.
            </Text>
          )}
        </View>
      </ScrollView>
    );
  };

  const renderAmountFullPage = () => {
    return (
      <View style={styles.amountFullPage}>
        <View style={[styles.amountMinimalTop, { paddingTop: insets.top + 6 }]}>
          <Pressable
            style={styles.amountBackBtn}
            onPress={handleBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronLeft size={22} color="#0f172a" strokeWidth={2.5} />
          </Pressable>
        </View>
        <View style={styles.amountFullPageBody}>{renderAmount()}</View>
        {renderSettlementPctDock()}
        <OperationalBottomActionBar>
          <OperationalButton
            intent="bottomSticky"
            label="Continue"
            onPress={handleAdvance}
            disabled={!canAdvance}
            density="high"
            fullWidth
          />
        </OperationalBottomActionBar>
      </View>
    );
  };

  const renderPartyAvatar = (
    item: LedgerWizardPartyOption,
    selected: boolean,
    size = 36,
  ) => (
    <EntityAvatar
      name={item.name}
      avatarUrl={item.avatar_url}
      avatarSeed={item.avatar_seed}
      entityType={item.entityType ?? "client"}
      isIntegrated={item.is_integrated}
      size={size}
      showIntegrationBadge={false}
    />
  );

  const renderParty = () => (
    <View style={styles.listPane}>
      <View style={styles.searchRow}>
        <Search size={14} color={Theme.textMuted} strokeWidth={2.2} />
        <TextInput
          style={styles.searchInput}
          value={partySearch}
          onChangeText={setPartySearch}
          placeholder="Search party…"
          placeholderTextColor={Theme.textMuted}
        />
      </View>
      <FlatList
        data={filteredParties}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No parties match your search.</Text>
        }
        renderItem={({ item }) => {
          const selected = props.partyId === item.id;
          return (
            <Pressable
              style={[styles.listRow, selected && styles.listRowActive]}
              onPress={() => props.onPartySelect(item.id)}
            >
              {renderPartyAvatar(item, selected) ?? (
                <View style={[styles.listAvatar, selected && { backgroundColor: accent }]}>
                  <Text style={[styles.listAvatarText, selected && { color: "#fff" }]}>
                    {item.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.listRowTitle} numberOfLines={1}>
                {item.name}
              </Text>
              {selected ? <Check size={16} color={accent} strokeWidth={2.8} /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );

  const renderTripFilters = () => (
    <View style={styles.filterRow}>
      {(
        [
          { id: "has_due" as const, label: "With due" },
          { id: "all" as const, label: "All trips" },
        ] as const
      ).map((opt) => {
        const on = tripDueFilter === opt.id;
        return (
          <Pressable
            key={opt.id}
            style={[styles.filterChip, on && styles.filterChipActive]}
            onPress={() => setTripDueFilter(opt.id)}
          >
            <Text style={[styles.filterChipText, on && styles.filterChipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderLockedParty = () => (
    <View style={styles.lockedCard}>
      <Text style={styles.lockedLabel}>Party</Text>
      <View style={styles.lockedPartyRow}>
        <EntityAvatar
          name={props.partyDisplayName ?? "—"}
          avatarUrl={props.partyAvatarUrl}
          avatarSeed={props.partyAvatarSeed}
          entityType={props.partyEntityType ?? "client"}
          isIntegrated={props.partyIsIntegrated}
          size={40}
          showIntegrationBadge={false}
        />
        <Text style={styles.lockedValue} numberOfLines={2}>
          {props.partyDisplayName ?? "—"}
        </Text>
      </View>
    </View>
  );

  const renderTrip = () => (
    <View style={styles.listPane}>
      {renderTripFilters()}
      <View style={styles.searchRow}>
        <Search size={14} color={Theme.textMuted} strokeWidth={2.2} />
        <TextInput
          style={styles.searchInput}
          value={tripSearch}
          onChangeText={setTripSearch}
          placeholder="Search trip or route…"
          placeholderTextColor={Theme.textMuted}
        />
      </View>
      <FlatList
        data={filteredTrips}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <Pressable
            style={[
              styles.listRow,
              props.selectedTripId == null && styles.listRowActive,
            ]}
            onPress={() => handleTripPick(null)}
          >
            <View style={[styles.listAvatar, { backgroundColor: "#f1f5f9" }]}>
              <Text style={styles.listAvatarText}>—</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.listRowTitle}>No trip</Text>
              <Text style={styles.listRowSub}>General entry</Text>
            </View>
            {props.selectedTripId == null ? (
              <Check size={16} color={accent} strokeWidth={2.8} />
            ) : null}
          </Pressable>
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {tripDueFilter === "has_due"
              ? "No trips with due for this party."
              : "No trips match your search."}
          </Text>
        }
        renderItem={({ item }) => {
          const selected = props.selectedTripId === item.id;
          const due = item.dueAmount ?? 0;
          return (
            <Pressable
              style={[styles.listRow, selected && styles.listRowActive]}
              onPress={() => handleTripPick(item.id)}
            >
              <View style={[styles.listAvatar, selected && { backgroundColor: accent }]}>
                <Text style={[styles.listAvatarText, selected && { color: "#fff" }]}>
                  {(item.trip_number || "T").slice(0, 1)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.listRowTitle} numberOfLines={1}>
                  {item.trip_number}
                </Text>
                <Text style={styles.listRowSub} numberOfLines={1}>
                  {[item.route_label, item.trip_date].filter(Boolean).join(" · ") || "Trip"}
                </Text>
              </View>
              {due > 0 ? (
                <View style={[styles.duePill, { borderColor: accent }]}>
                  <Text style={[styles.duePillText, { color: accent }]}>
                    ₹{formatDueCompact(due)}
                  </Text>
                </View>
              ) : null}
              {selected ? <Check size={16} color={accent} strokeWidth={2.8} /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );

  const renderPaymentType = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridPad}>
      <View style={styles.iconGrid}>
        {props.paymentTypeItems.map((item) => {
          const selected = item.selected;
          return (
            <Pressable
              key={item.key}
              style={[styles.typeTile, selected && styles.typeTileActive]}
              onPress={item.onPress}
            >
              <View style={[styles.typeIconWrap, selected && { backgroundColor: "rgba(99,102,241,0.15)" }]}>
                <LedgerPaymentTypeIcon kind={item.kind} size={18} />
              </View>
              <Text style={[styles.typeTileLabel, selected && styles.typeTileLabelActive]} numberOfLines={2}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderPaymentMode = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridPad}>
      <View style={styles.iconGrid}>
        {LEDGER_PAYMENT_MODES.map((mode) => {
          const selected = props.paymentModeId === mode.id;
          return (
            <Pressable
              key={mode.id}
              style={[styles.modeTile, selected && { borderColor: mode.color, backgroundColor: mode.tint }]}
              onPress={() => props.onPaymentModeSelect(mode.id)}
            >
              <LedgerPaymentModeTile modeId={mode.id} selected={selected} />
              <Text style={[styles.modeTileLabel, selected && { color: mode.color }]} numberOfLines={1}>
                {mode.shortLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderDetails = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {!isLedgerCashPaymentMode(props.paymentModeId) ? (
        <View style={shell.fieldBlock}>
          <Text style={shell.fieldLabel}>REFERENCE / UTR</Text>
          <TextInput
            style={[shell.input, compact && styles.inputCompact]}
            value={props.paymentReference}
            onChangeText={props.onPaymentReferenceChange}
            placeholder="UTR or bank reference"
            placeholderTextColor={Theme.textMuted}
            autoCapitalize="characters"
          />
        </View>
      ) : null}
      <Text style={shell.fieldLabel}>ENTRY DATE</Text>
      <View style={styles.dateRow}>
        {[
          { label: "Today", iso: todayIso },
          { label: "Yesterday", iso: yesterdayIso },
        ].map((opt) => {
          const selected = props.entryDate === opt.iso;
          return (
            <Pressable
              key={opt.iso}
              style={[styles.dateChip, selected && styles.dateChipActive]}
              onPress={() => props.onEntryDateChange(opt.iso)}
            >
              <Calendar size={12} color={selected ? Theme.primary : Theme.textMuted} strokeWidth={2.2} />
              <Text style={[styles.dateChipText, selected && styles.dateChipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderReview = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.reviewScroll}>
      {props.tripLedgerPreview ? (
        <View style={styles.reviewLedgerNoteWrap}>
          <LedgerTripSettlementNote
            preview={props.tripLedgerPreview}
            enteredInr={parseAmount(props.amountStr)}
          />
        </View>
      ) : null}
      <LedgerReviewTicket
        type={props.type}
        amountStr={props.amountStr}
        partyDisplayName={props.partyDisplayName}
        partyAvatarUrl={props.partyAvatarUrl}
        partyAvatarSeed={props.partyAvatarSeed}
        partyEntityType={props.partyEntityType}
        partyIsIntegrated={props.partyIsIntegrated}
        reconRows={props.reconRows}
        isEditMode={props.isEditMode}
      />
    </ScrollView>
  );

  const body = (() => {
    switch (currentStep) {
      case "direction":
        return renderDirection();
      case "amount":
        return renderAmount();
      case "party":
        return props.partyLocked ? renderLockedParty() : renderParty();
      case "trip":
        return props.tripLocked ? (
          <View style={styles.lockedCard}>
            <Text style={styles.lockedLabel}>Trip</Text>
            <Text style={styles.lockedValue}>{props.tripDisplay ?? "—"}</Text>
          </View>
        ) : (
          renderTrip()
        );
      case "paymentType":
        return renderPaymentType();
      case "paymentMode":
        return renderPaymentMode();
      case "details":
        return renderDetails();
      case "review":
        return renderReview();
      default:
        return null;
    }
  })();

  const c = compact ? compactShell : shell;

  if (currentStep === "amount") {
    return (
      <View style={styles.amountFullPageShell}>
        {renderAmountFullPage()}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={c.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[c.root, { paddingTop: insets.top }]}>
        <View style={[c.topBar, compact && styles.topBarCompact]}>
          <Pressable style={c.backBtn} onPress={handleBack} hitSlop={12}>
            <ChevronLeft size={20} color="#0f172a" strokeWidth={2.5} />
          </Pressable>
          <View style={c.progressRow}>
            {steps.map((id, i) => (
              <View
                key={id}
                style={[c.progressDot, i <= stepIndex && c.progressDotActive, compact && i <= stepIndex && styles.progressDotActiveCompact]}
              />
            ))}
          </View>
          <View style={c.backBtnSpacer} />
        </View>

        {!compact ? (
          <View style={c.hero}>
            <View style={c.titleRow}>
              <View style={c.liveDot} />
              <Text style={c.entityTitle}>{entityTitle}</Text>
            </View>
            {props.entryContextLabel ? (
              <Text style={c.subtitle} numberOfLines={2}>
                {props.entryContextLabel}
              </Text>
            ) : null}
          </View>
        ) : null}

        {props.stepError ? (
          <View style={[c.errorBar, compact && styles.errorBarCompact]}>
            <Text style={c.errorText}>{props.stepError}</Text>
          </View>
        ) : null}

        <View
          style={[
            c.body,
            compact && styles.bodyCompact,
            currentStep === "party" || currentStep === "trip" ? styles.bodyFlex : null,
          ]}
        >
          <View style={[styles.stepHeader, currentStep === "review" && styles.stepHeaderReview]}>
            {compact ? (
              <View style={styles.compactContext}>
                <View style={c.titleRow}>
                  <View style={c.liveDot} />
                  <Text style={styles.entityTitleCompact}>{entityTitle}</Text>
                </View>
                {props.entryContextLabel ? (
                  <Text style={styles.subtitleCompact} numberOfLines={1}>
                    {props.entryContextLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {currentStep !== "review" ? (
              <Text style={[c.stepTitle, compact && styles.stepTitleCompact]}>{title}</Text>
            ) : (
              <Text style={[c.stepTitle, compact && styles.stepTitleCompact]}>Review & save</Text>
            )}
            {hint && currentStep !== "review" ? (
              <Text style={[c.stepHint, compact && styles.stepHintCompact]}>{hint}</Text>
            ) : currentStep === "review" ? (
              <Text style={[c.stepHint, compact && styles.stepHintCompact]}>
                Confirm details on your ticket before saving.
              </Text>
            ) : null}
          </View>
          {body}
        </View>

        <View
          style={[
            c.footer,
            compact && styles.footerCompact,
            styles.footerAboveBrowserChrome,
            { paddingBottom: bottomInset + 12 },
          ]}
        >
          {currentStep === "review" ? (
            <Pressable
              style={[
                styles.saveBtn,
                (!props.canSubmit || props.submitting) && styles.saveBtnDisabled,
              ]}
              onPress={handleAdvance}
              disabled={!props.canSubmit || props.submitting}
            >
              <Check size={18} color="#fff" strokeWidth={2.8} />
              <Text style={styles.saveBtnText}>
                {props.submitting ? "Saving…" : advanceLabel}
              </Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                style={[c.fab, compact && styles.fabCompact, !canAdvance && c.fabDisabled]}
                onPress={handleAdvance}
                disabled={!canAdvance}
              >
                <ArrowRight size={20} color="#fff" strokeWidth={2.8} />
              </Pressable>
              <Text style={[c.footerHint, compact && styles.footerHintCompact]}>{advanceLabel}</Text>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
});

const compactShell = {
  ...shell,
  topBar: { ...shell.topBar, paddingHorizontal: 12, paddingBottom: 4 },
  body: { ...shell.body, paddingHorizontal: 16, paddingTop: 0 },
  footer: { ...shell.footer, paddingHorizontal: 16, paddingTop: 4 },
  stepTitle: { ...shell.stepTitle, fontSize: 20 },
  stepHint: { ...shell.stepHint, marginBottom: 0, fontSize: 12, lineHeight: 17 },
};

const styles = StyleSheet.create({
  stepHeader: {
    marginBottom: 10,
    gap: 4,
  },
  stepHeaderReview: {
    marginBottom: 8,
  },
  compactContext: {
    gap: 2,
    marginBottom: 4,
  },
  bodyFlex: {
    flex: 1,
    minHeight: 0,
  },
  listPane: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: 12,
    gap: 6,
  },
  reviewScroll: {
    paddingBottom: 8,
  },
  reviewLedgerNoteWrap: {
    marginBottom: 10,
  },
  errorBarCompact: {
    marginHorizontal: 16,
    marginBottom: 6,
  },
  topBarCompact: { paddingHorizontal: 12, paddingBottom: 2 },
  bodyCompact: { paddingHorizontal: 16, paddingTop: 0 },
  footerCompact: { paddingHorizontal: 16, paddingTop: 2 },
  footerAboveBrowserChrome: Platform.select({
    web: {
      flexShrink: 0,
      backgroundColor: "#fff",
    },
    default: {},
  }),
  entityTitleCompact: { fontSize: 10, letterSpacing: 1.4 },
  subtitleCompact: { fontSize: 12, marginTop: 4 },
  stepTitleCompact: { fontSize: 20, letterSpacing: -0.3 },
  stepHintCompact: { fontSize: 12, marginBottom: 0, lineHeight: 17 },
  progressDotActiveCompact: { width: 18, height: 6, borderRadius: 3 },
  fabCompact: { width: 48, height: 48, borderRadius: 24 },
  footerHintCompact: { fontSize: 9 },
  inputCompact: {
    fontSize: 15,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
  },
  choiceCol: { gap: 8 },
  directionCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  directionCardActiveIn: {
    borderColor: Theme.darkGreen,
    backgroundColor: "#f0fdf4",
  },
  directionCardActiveOut: {
    borderColor: Theme.teslaRed,
    backgroundColor: "#fef2f2",
  },
  directionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  directionTextCol: { flex: 1, minWidth: 0 },
  directionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  directionSub: {
    fontSize: 12,
    color: Theme.textMuted,
    marginTop: 2,
  },
  amountBlock: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: "#f8fafc",
    minHeight: 52,
  },
  amountFullPageShell: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  amountFullPage: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  amountFullPageBody: {
    flex: 1,
    minHeight: 0,
  },
  amountScroll: {
    flex: 1,
  },
  amountScrollContentCentered: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    alignItems: "center",
  },
  amountPctDock: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    backgroundColor: Theme.screenBackground,
  },
  amountHeroStack: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 10,
  },
  amountMinimalTop: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  amountBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  amountAvatarRing: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#eef2f7",
    marginBottom: 4,
  },
  amountPayLine: {
    fontSize: 15,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  amountPayLineName: {
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  amountContextLineCentered: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 15,
    paddingHorizontal: 12,
    marginTop: -4,
  },
  amountHeroInputWrap: {
    width: "100%",
    marginTop: 8,
    marginBottom: 4,
  },
  amountDueChip: {
    marginTop: 4,
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 12,
  },
  amountDueChipLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
  },
  amountDueChipValue: {
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  amountSettledChip: {
    marginTop: 8,
    maxWidth: 320,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  amountSettledChipTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.2,
  },
  amountSettledChipSub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 16,
  },
  pctSectionLabelCentered: {
    marginBottom: 6,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
    textAlign: "center",
    width: "100%",
  },
  pctSubsectionLabel: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
    textAlign: "center",
    width: "100%",
  },
  fullPayTile: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 2,
    minHeight: 52,
  },
  fullPayTileActive: {
    backgroundColor: Theme.pulseIndigoWash,
    borderWidth: 2,
  },
  fullPayLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  fullPayAmount: {
    fontSize: 15,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
    lineHeight: 18,
  },
  amountMetaHintCentered: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 13,
    textAlign: "center",
    paddingHorizontal: 16,
    marginTop: 8,
  },
  pctGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    width: "100%",
    justifyContent: "center",
  },
  pctTile: {
    width: "31%",
    minWidth: 96,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#e6edf5",
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 3,
    minHeight: 48,
  },
  pctTileActive: {
    borderColor: Theme.pulseIndigoRing,
    backgroundColor: Theme.pulseIndigoWash,
  },
  pctTilePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  pctTilePct: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  pctTilePctActive: {
    color: Theme.primary,
  },
  pctTileAmt: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
    lineHeight: 11,
  },
  pctTileAmtActive: {
    color: Theme.primary,
    fontWeight: "700",
  },
  amountMetaHint: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 11,
    marginTop: 2,
  },
  amountPrefix: {
    fontSize: 22,
    fontWeight: "800",
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 26,
    fontWeight: "700",
    color: "#0f172a",
    paddingVertical: 8,
    ...Platform.select({ web: { outlineStyle: "none" } as object }),
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  filterChipActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.1)",
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filterChipTextActive: {
    color: Theme.primary,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    ...Platform.select({ web: { outlineStyle: "none" } as object }),
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  listRowActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.06)",
  },
  listAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  listAvatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  listRowTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    minWidth: 0,
  },
  listRowSub: {
    fontSize: 11,
    color: Theme.textMuted,
    marginTop: 2,
  },
  duePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 4,
  },
  duePillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textMuted,
    textAlign: "center",
    paddingVertical: 20,
  },
  gridPad: { paddingBottom: 12 },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeTile: {
    width: "47%",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 6,
    minHeight: 80,
  },
  typeTileActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  typeIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  typeTileLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textAlign: "center",
  },
  typeTileLabelActive: {
    color: Theme.primary,
  },
  modeTile: {
    width: "30%",
    flexGrow: 1,
    minWidth: 88,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 8,
  },
  modeTileLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  dateRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
    marginTop: 6,
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  dateChipActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.1)",
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  dateChipTextActive: {
    color: Theme.primary,
  },
  lockedCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#f8fafc",
  },
  lockedLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: Theme.textMuted,
    marginBottom: 8,
  },
  lockedPartyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lockedValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    minWidth: 0,
  },
  reviewCard: {
    alignItems: "center",
    paddingVertical: 14,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reviewPartyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reviewPartyText: {
    flex: 1,
    minWidth: 0,
  },
  reviewPartyLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  reviewPartyName: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  reviewDetailsCard: {
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  reviewAmount: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  reviewDirection: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  reviewLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    flex: 1,
  },
  reviewValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    flex: 1.2,
    textAlign: "right",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    backgroundColor: "#0f172a",
    paddingVertical: 12,
    borderRadius: 12,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.buttonDarkText,
    letterSpacing: 0.3,
  },
});
