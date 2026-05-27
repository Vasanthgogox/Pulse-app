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
import Theme from "@/constants/Theme";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import { partyMobileWizardStyles as shell } from "@/components/party/partyMobileWizardStyles";
import { LedgerReviewTicket } from "@/components/ledger/LedgerReviewTicket";
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
}

function parseAmount(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

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
    case "amount":
      return {
        title: props.type === "in" ? "Amount received" : "Amount paid",
        hint: props.amountPlaceholder
          ? `Due: ₹${props.amountPlaceholder} — edit if needed`
          : "Enter the settlement amount.",
      };
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

export const LedgerMobileWizard = memo(function LedgerMobileWizard(props: LedgerMobileWizardProps) {
  const insets = useSafeAreaInsets();
  const compact = props.compact !== false;
  const steps = useMemo(() => buildSteps(props), [props]);
  const [stepIndex, setStepIndex] = useState(() => resolveInitialStepIndex(steps, props));
  const [partySearch, setPartySearch] = useState("");
  const [tripSearch, setTripSearch] = useState("");
  const [tripDueFilter, setTripDueFilter] = useState<"all" | "has_due">(
    props.defaultTripDueFilter ?? "all",
  );

  const lastSessionKeyRef = useRef(props.flowSessionKey ?? "");
  useEffect(() => {
    const key = props.flowSessionKey ?? "";
    if (key === lastSessionKeyRef.current) return;
    lastSessionKeyRef.current = key;
    setStepIndex(resolveInitialStepIndex(steps, props));
    setTripDueFilter(props.defaultTripDueFilter ?? "all");
    setPartySearch("");
    setTripSearch("");
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

  const renderAmount = () => (
    <View style={styles.amountBlock}>
      <Text style={[styles.amountPrefix, { color: accent }]}>₹</Text>
      <TextInput
        style={styles.amountInput}
        value={props.amountStr}
        onChangeText={props.onAmountChange}
        placeholder={props.amountPlaceholder || "0"}
        placeholderTextColor={Theme.textMuted}
        keyboardType="decimal-pad"
        autoFocus
      />
    </View>
  );

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
        contentContainerStyle={styles.listContent}
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
        contentContainerStyle={styles.listContent}
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

        <View style={[c.footer, compact && styles.footerCompact, { paddingBottom: insets.bottom + 12 }]}>
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
  errorBarCompact: {
    marginHorizontal: 16,
    marginBottom: 6,
  },
  topBarCompact: { paddingHorizontal: 12, paddingBottom: 2 },
  bodyCompact: { paddingHorizontal: 16, paddingTop: 0 },
  footerCompact: { paddingHorizontal: 16, paddingTop: 2 },
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
    color: "#fff",
    letterSpacing: 0.3,
  },
});
