/**
 * Create story — LOAD (from an existing indent or manual) or VEHICLE AVAILABILITY.
 * Expires in 24h. No social updates.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { BroadcastPickIndentCard } from "@/features/network/components/BroadcastPickIndentCard";
import { createPost, type PostType } from "@/features/network/services/posts.service";
import {
  createIndent,
  getIndentDisplayNumber,
  resolveSupplierTargetDisplayRate,
} from "@/features/indents/services/indents.service";
import { indentCanBroadcastToPulseNetwork } from "@/features/network/utils/indentBroadcastEligibility.util";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useInvalidatePosts } from "@/lib/queries/usePostsQuery";
import { useIndentsQuery, useDirectQuoteCountsQuery, useInvalidateIndents } from "@/lib/queries/useIndentsQuery";
import { useVehiclesQuery } from "@/lib/queries/useVehiclesQuery";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Car,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  MapPin,
  Package,
  Search,
  Truck,
  Zap,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const STORY_TYPES: PostType[] = ["LOAD", "VEHICLE_AVAILABILITY"];
const VEHICLE_TYPES = [
  "20ft",
  "32ft",
  "SXL",
  "MXL",
  "Tanker",
  "Container",
  "Open Body",
  "Trailer",
];

function defaultExpiresAt(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

export default function CreatePostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { currentOrganization: organization } = useOrganization();
  const { profile, status: authStatus } = useAuth();
  const orgId = organization?.id ?? null;
  const invalidatePosts = useInvalidatePosts(orgId);
  const invalidateIndents = useInvalidateIndents();

  const [type, setType] = useState<"LOAD" | "VEHICLE_AVAILABILITY">("LOAD");
  /** Pick an org indent (not awarded) vs type route manually. */
  const [loadEntryMode, setLoadEntryMode] = useState<"pick" | "manual">("pick");
  const [vehicleEntryMode, setVehicleEntryMode] = useState<"idle" | "manual">("idle");
  const [selectedIndentId, setSelectedIndentId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [loadSearch, setLoadSearch] = useState("");

  const [content, setContent] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [weight, setWeight] = useState("");
  const [rate, setRate] = useState("");
  const [material, setMaterial] = useState("");
  const [availability, setAvailability] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: indents = [], isLoading: indentsLoading } = useIndentsQuery(orgId);
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehiclesQuery(orgId);

  const ownedVehicles = useMemo(() => {
    const list = (vehicles ?? []) as Array<{
      id: string;
      vehicle_number: string;
      vehicle_type: string | null;
      capacity?: string | null;
      vehicle_body_type?: string | null;
      vehicle_brand?: string | null;
      vehicle_model?: string | null;
      type?: string | null;
      status?: string | null;
    }>;
    return list.filter((v) => (v.type ?? "owned").toLowerCase() === "owned");
  }, [vehicles]);

  const idleVehicles = useMemo(() => {
    const isIdleStatus = (status: string | null | undefined) => {
      const s = (status ?? "").toLowerCase();
      return s === "idle" || s === "available" || s === "free";
    };
    return ownedVehicles.filter((v) => isIdleStatus(v.status));
  }, [ownedVehicles]);

  const vehicleFleetStatus = useMemo(() => {
    if (vehiclesLoading) return "loading" as const;
    if (ownedVehicles.length === 0) return "empty" as const;
    if (idleVehicles.length === 0) return "no_idle" as const;
    return "ready" as const;
  }, [vehiclesLoading, ownedVehicles.length, idleVehicles.length]);

  const broadcastableIndents = useMemo(() => {
    const q = loadSearch.trim().toLowerCase();
    const list = (indents ?? []).filter(indentCanBroadcastToPulseNetwork);
    const filtered = q
      ? list.filter((i) => {
          const displayNo = getIndentDisplayNumber(i).toLowerCase();
          const hay = [
            displayNo,
            i.pickup_area,
            i.drop_location,
            i.client_name,
            i.trip_number,
            i.load_type,
            i.vehicle_type,
            String(i.id),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : list;
    return [...filtered].sort((a, b) => {
      const ta = new Date(a.created_at ?? 0).getTime();
      const tb = new Date(b.created_at ?? 0).getTime();
      return tb - ta;
    });
  }, [indents, loadSearch]);

  const pickIds = useMemo(
    () => (broadcastableIndents.length ? broadcastableIndents.map((i) => i.id) : null),
    [broadcastableIndents],
  );
  const { data: quoteCounts = {} } = useDirectQuoteCountsQuery(pickIds);

  const canSubmitLoadPick =
    type === "LOAD" &&
    loadEntryMode === "pick" &&
    !!selectedIndentId &&
    broadcastableIndents.some((i) => i.id === selectedIndentId);

  const canSubmitLoadManual =
    type === "LOAD" &&
    loadEntryMode === "manual" &&
    origin.trim().length > 0 &&
    destination.trim().length > 0;

  const canSubmitVehicle =
    type === "VEHICLE_AVAILABILITY" &&
    origin.trim().length > 0 &&
    (vehicleEntryMode === "idle" ? !!selectedVehicleId : vehicleType.trim().length > 0) &&
    availability.trim().length > 0;

  const pickColumns = windowWidth >= 640 ? 2 : 1;
  const pickCellWidth = pickColumns === 2 ? "49%" : "100%";
  const isDesktop = windowWidth >= 1024;

  const canSubmit = (canSubmitLoadPick || canSubmitLoadManual || canSubmitVehicle) && !submitting;

  const selectedIndent = useMemo(
    () => broadcastableIndents.find((i) => i.id === selectedIndentId) ?? null,
    [broadcastableIndents, selectedIndentId],
  );

  /** Live preview of the story being composed (desktop side panel). */
  const preview = useMemo(() => {
    if (type === "LOAD" && loadEntryMode === "pick") {
      const w = selectedIndent?.weight != null ? selectedIndent.weight / 1000 : null;
      const r = selectedIndent
        ? resolveSupplierTargetDisplayRate(selectedIndent.supplier_target, selectedIndent.client_price)
        : null;
      return {
        kind: "LOAD" as const,
        origin: selectedIndent?.pickup_area ?? "",
        destination: selectedIndent?.drop_location ?? "",
        vehicleType: selectedIndent?.vehicle_type ?? "",
        material: selectedIndent?.load_type ?? "",
        weight: w != null ? `${w % 1 === 0 ? w : w.toFixed(1)} T` : "",
        rate: r != null ? `₹${Number(r).toLocaleString("en-IN")}` : "",
        availability: "",
      };
    }
    if (type === "LOAD") {
      return {
        kind: "LOAD" as const,
        origin: origin.trim(),
        destination: destination.trim(),
        vehicleType: vehicleType.trim(),
        material: material.trim(),
        weight: weight.trim() ? `${weight.trim()} T` : "",
        rate: rate.trim() ? `₹${rate.trim()}` : "",
        availability: "",
      };
    }
    return {
      kind: "VEHICLE" as const,
      origin: origin.trim(),
      destination: destination.trim(),
      vehicleType: vehicleType.trim(),
      material: "",
      weight: "",
      rate: "",
      availability: availability.trim(),
    };
  }, [type, loadEntryMode, selectedIndent, origin, destination, vehicleType, material, weight, rate, availability]);

  /** Required-field checklist shown on the deploy panel. */
  const readiness = useMemo<{ label: string; done: boolean }[]>(() => {
    if (type === "LOAD" && loadEntryMode === "pick") {
      return [{ label: "Load indent selected", done: !!selectedIndentId }];
    }
    if (type === "LOAD") {
      return [
        { label: "Pickup location", done: origin.trim().length > 0 },
        { label: "Drop location", done: destination.trim().length > 0 },
      ];
    }
    return [
      { label: "Current location", done: origin.trim().length > 0 },
      {
        label: vehicleEntryMode === "idle" ? "Vehicle selected" : "Vehicle type",
        done:
          vehicleEntryMode === "idle" ? !!selectedVehicleId : vehicleType.trim().length > 0,
      },
      { label: "Availability window", done: availability.trim().length > 0 },
    ];
  }, [type, loadEntryMode, selectedIndentId, origin, destination, vehicleEntryMode, selectedVehicleId, vehicleType, availability]);

  const switchToManualVehicleEntry = () => {
    setVehicleEntryMode("manual");
    setSelectedVehicleId(null);
  };

  const switchToIdleVehicleEntry = () => {
    setVehicleEntryMode("idle");
    setSelectedVehicleId(null);
    setVehicleType("");
    setAvailability("");
  };

  const showManualVehicleFields =
    vehicleEntryMode === "manual" || (vehicleEntryMode === "idle" && !selectedVehicleId);
  const isLoadStory = type === "LOAD";
  const previewAccent = isLoadStory ? "#f59e0b" : Theme.primary;

  const renderPreviewPanel = () => (
    <View style={styles.previewCol}>
      <Text style={styles.previewKicker}>Live preview</Text>
      <View style={styles.previewCard}>
        <View style={[styles.previewAccentBar, { backgroundColor: previewAccent }]} />
        <View style={styles.previewTopRow}>
          <View style={[styles.previewBadge, { backgroundColor: previewAccent + "18" }]}>
            {isLoadStory ? (
              <Truck size={13} color={previewAccent} />
            ) : (
              <MapPin size={13} color={previewAccent} />
            )}
            <Text style={[styles.previewBadgeText, { color: previewAccent }]}>
              {isLoadStory ? "Load" : "Vehicle free"}
            </Text>
          </View>
          <View style={styles.previewExpiry}>
            <Clock size={11} color={Theme.textMuted} />
            <Text style={styles.previewExpiryText}>Expires in 24h</Text>
          </View>
        </View>

        <View style={styles.previewRoute}>
          <Text
            style={[styles.previewCity, !preview.origin && styles.previewCityMuted]}
            numberOfLines={1}
          >
            {preview.origin || (isLoadStory ? "Pickup" : "Current location")}
          </Text>
          <ArrowRight size={15} color={Theme.textMuted} />
          <Text
            style={[styles.previewCity, !preview.destination && styles.previewCityMuted]}
            numberOfLines={1}
          >
            {preview.destination || (isLoadStory ? "Drop" : "Anywhere")}
          </Text>
        </View>

        {(preview.vehicleType || preview.weight || preview.rate || preview.material) && (
          <View style={styles.previewChips}>
            {preview.vehicleType ? (
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>{preview.vehicleType}</Text>
              </View>
            ) : null}
            {preview.weight ? (
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>{preview.weight}</Text>
              </View>
            ) : null}
            {preview.material ? (
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>{preview.material}</Text>
              </View>
            ) : null}
            {preview.rate ? (
              <View style={[styles.previewChip, styles.previewChipRate]}>
                <Text style={[styles.previewChipText, styles.previewChipRateText]}>
                  {preview.rate}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {preview.availability ? (
          <Text style={styles.previewAvailability} numberOfLines={2}>
            {preview.availability}
          </Text>
        ) : null}

        <View style={styles.previewFooter}>
          <View style={[styles.previewOrgDot, { backgroundColor: previewAccent }]} />
          <Text style={styles.previewFooterText} numberOfLines={1}>
            {organization?.name ?? "Your organization"}
          </Text>
        </View>
      </View>

      <View style={styles.readinessCard}>
        <Text style={styles.readinessTitle}>Before you deploy</Text>
        {readiness.map((item) => (
          <View key={item.label} style={styles.readinessRow}>
            {item.done ? (
              <CheckCircle2 size={15} color="#10b981" />
            ) : (
              <Circle size={15} color={Theme.borderMedium} />
            )}
            <Text style={[styles.readinessLabel, item.done && styles.readinessLabelDone]}>
              {item.label}
            </Text>
          </View>
        ))}
        <View style={styles.readinessDivider} />
        <View style={styles.readinessHintRow}>
          <Clock size={12} color={Theme.textMuted} />
          <Text style={styles.readinessHint}>
            Visible to the Pulse network for 24 hours, then auto-expires.
          </Text>
        </View>
      </View>
    </View>
  );

  const handleSubmit = async () => {
    if (!orgId || !canSubmit || authStatus === "restoring") return;
    if (!STORY_TYPES.includes(type)) {
      Alert.alert("Invalid type", "Only load and vehicle availability stories are allowed.");
      return;
    }
    setSubmitting(true);
    const parsed = parseFloat(rate.replace(/,/g, ""));
    const weightParsed = parseFloat(weight);
    const expiresAt = defaultExpiresAt();

    let error: Error | null = null;

    if (type === "LOAD" && loadEntryMode === "pick" && selectedIndentId) {
      const indent = broadcastableIndents.find((i) => i.id === selectedIndentId);
      if (!indent) {
        setSubmitting(false);
        Alert.alert("Select a load", "Choose an indent from the list.");
        return;
      }
      const w = indent.weight != null ? indent.weight / 1000 : undefined;
      const res = await createPost({
        organizationId: orgId,
        type: "LOAD",
        content: content.trim() || undefined,
        origin: indent.pickup_area || undefined,
        destination: indent.drop_location || undefined,
        loadDate: indent.pickup_date ?? undefined,
        vehicleType: indent.vehicle_type ?? undefined,
        weightTonnes: w,
        rateOffer:
          resolveSupplierTargetDisplayRate(indent.supplier_target, indent.client_price) ??
          undefined,
        material: indent.load_type ?? undefined,
        expiresAt,
        sourceIndentId: selectedIndentId,
      });
      error = res.error;
    } else if (type === "LOAD" && loadEntryMode === "manual") {
      const weightTonnes = Number.isNaN(weightParsed) || weightParsed <= 0 ? 6 : weightParsed;
      const weightKg = Math.max(100, weightTonnes * 1000);
      const rateNum = Number.isNaN(parsed) || parsed <= 0 ? 1 : parsed;
      const mat = material.trim() || "General";
      const veh = vehicleType.trim() || "Open Body";
      const { error: indentErr, indent: pulseIndent } = await createIndent(
        orgId,
        {
          pickup_area: origin.trim(),
          drop_location: destination.trim(),
          client_name: mat.slice(0, 200),
          client_price: rateNum,
          supplier_target: rateNum,
          vehicle_type: veh,
          load_type: mat.slice(0, 100),
          weight: weightKg,
          pickup_date: null,
          circulation_target: "both",
          owner_user_id: profile?.uid ?? undefined,
          created_by_user_id: profile?.uid ?? undefined,
        },
        { action: "share" },
      );
      if (indentErr || !pulseIndent) {
        error = indentErr ?? new Error("Could not create indent for this story");
      } else {
        const res = await createPost({
          organizationId: orgId,
          type: "LOAD",
          content: content.trim() || undefined,
          origin: origin.trim() || undefined,
          destination: destination.trim() || undefined,
          vehicleType: veh || undefined,
          weightTonnes: weightTonnes,
          rateOffer: rateNum,
          material: mat || undefined,
          expiresAt,
          sourceIndentId: pulseIndent.id,
        });
        error = res.error;
      }
    } else {
      const res = await createPost({
        organizationId: orgId,
        type: "VEHICLE_AVAILABILITY",
        content: [availability.trim(), content.trim()].filter(Boolean).join(" · ") || undefined,
        origin: origin.trim() || undefined,
        destination: destination.trim() || undefined,
        vehicleType: vehicleType || undefined,
        expiresAt,
      });
      error = res.error;
    }

    setSubmitting(false);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    invalidatePosts();
    invalidateIndents(orgId);
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.header, isDesktop && styles.headerDesktop]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={Theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Broadcast story</Text>
        <Pressable
          style={[
            styles.publishBtn,
            canSubmit ? styles.publishBtnActive : styles.publishBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? (
            <LoadingIndicator size={14} color="#fff" />
          ) : (
            <View style={styles.publishBtnInner}>
              <Zap size={12} color={Theme.buttonPrimaryText} fill={Theme.buttonPrimaryText} />
              <Text style={styles.publishBtnText}>Deploy</Text>
            </View>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        enabled={Platform.OS !== "web"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          style={styles.form}
          contentContainerStyle={[
            styles.formContent,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.canvas, isDesktop && styles.canvasWide]}>
           <View style={[styles.workspace, isDesktop && styles.workspaceWide]}>
            <View style={[styles.formCol, isDesktop && styles.formColWide]}>
            <View style={styles.hintBox}>
              <Text style={styles.hintText}>
                Stories expire in 24 hours. Only load and vehicle availability — no personal or
                generic updates. For loads, pick an open indent from Load Center or enter details
                manually.
              </Text>
            </View>

            <View style={[styles.typeSelector, isDesktop && styles.typeSelectorDesktop]}>
              <Pressable
                style={[styles.typeBtn, type === "LOAD" && styles.typeBtnActiveLoad]}
                onPress={() => {
                  setType("LOAD");
                }}
              >
                <Truck size={15} color={type === "LOAD" ? "#fff" : Theme.textSecondary} />
                <Text style={[styles.typeBtnText, type === "LOAD" && styles.typeBtnTextActive]}>
                  Load indent
                </Text>
              </Pressable>
              <Pressable
                style={[styles.typeBtn, type === "VEHICLE_AVAILABILITY" && styles.typeBtnActiveVehicle]}
                onPress={() => {
                  setType("VEHICLE_AVAILABILITY");
                  setLoadEntryMode("pick");
                  setSelectedIndentId(null);
                  setVehicleEntryMode("idle");
                }}
              >
                <MapPin
                  size={15}
                  color={type === "VEHICLE_AVAILABILITY" ? "#fff" : Theme.textSecondary}
                />
                <Text
                  style={[
                    styles.typeBtnText,
                    type === "VEHICLE_AVAILABILITY" && styles.typeBtnTextActive,
                  ]}
                >
                  Vehicle free
                </Text>
              </Pressable>
            </View>

          {type === "LOAD" && loadEntryMode === "pick" && (
            <View style={styles.pickSection}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionKicker}>Open indents</Text>
                  <Text style={styles.pickSectionTitle}>
                    Pick a load to broadcast{" "}
                    <Text style={styles.sectionCount}>({broadcastableIndents.length})</Text>
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setLoadEntryMode("manual");
                    setSelectedIndentId(null);
                  }}
                  style={({ pressed }) => [styles.secondaryLink, pressed && { opacity: 0.75 }]}
                >
                  <Text style={styles.secondaryLinkText}>Enter manually</Text>
                </Pressable>
              </View>
              <Text style={styles.sectionSub}>
                Only indents that are not awarded and not assigned can go to the story reel — same
                as Pulse on Load Center.
              </Text>

              <View style={styles.searchBar}>
                <Search size={16} color={Theme.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search route, client, number…"
                  placeholderTextColor={Theme.textSecondary}
                  value={loadSearch}
                  onChangeText={setLoadSearch}
                />
              </View>

              {indentsLoading ? (
                <View style={styles.loadListLoading}>
                  <LoadingIndicator size="small" color={Theme.primary} />
                  <Text style={styles.loadListLoadingText}>Loading your indents…</Text>
                </View>
              ) : broadcastableIndents.length === 0 ? (
                <View style={styles.emptyPick}>
                  <Package size={40} color={Theme.textMuted} />
                  <Text style={styles.emptyTitle}>No indents to broadcast</Text>
                  <Text style={styles.emptySub}>
                    Create a load in Load Center. Once it is open and not yet awarded, it appears
                    here.
                  </Text>
                  <Pressable
                    style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.9 }]}
                    onPress={() => router.push(ROUTES.PULSE_LOADS)}
                  >
                    <Zap size={15} color="#fff" fill="#fff" />
                    <Text style={styles.emptyCtaText}>Open load center</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setLoadEntryMode("manual");
                      setSelectedIndentId(null);
                    }}
                    style={({ pressed }) => [styles.emptySecondary, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={styles.emptySecondaryText}>Or enter a route manually</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.pickGrid}>
                  {broadcastableIndents.map((load) => (
                    <View
                      key={load.id}
                      style={[
                        styles.pickGridCell,
                        { width: pickCellWidth },
                      ]}
                    >
                      <BroadcastPickIndentCard
                        load={load}
                        selected={selectedIndentId === load.id}
                        bidCount={quoteCounts[load.id] ?? 0}
                        onPress={() =>
                          setSelectedIndentId((prev) => (prev === load.id ? null : load.id))
                        }
                      />
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.notesBlock}>
                <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Extra context for partners (conditions, window…)"
                  placeholderTextColor={Theme.textSecondary}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          )}

          {type === "LOAD" && loadEntryMode === "manual" && (
            <View style={styles.loadForm}>
              <View style={styles.modeBanner}>
                <Text style={styles.modeBannerText}>Manual entry</Text>
                <Pressable
                  onPress={() => {
                    setLoadEntryMode("pick");
                    setOrigin("");
                    setDestination("");
                    setVehicleType("");
                    setWeight("");
                    setRate("");
                    setMaterial("");
                    setContent("");
                  }}
                  style={({ pressed }) => [styles.modeBannerAction, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.modeBannerActionText}>← Pick from my indents</Text>
                </Pressable>
              </View>
              <View style={styles.orgBadge}>
                <Zap size={12} color={Theme.primary} />
                <Text style={styles.orgBadgeText}>{organization?.name}</Text>
              </View>
              <View style={styles.routeSection}>
                <View style={styles.fieldGroup}>
                  <View style={[styles.fieldDot, { backgroundColor: "#10b981" }]} />
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>PICKUP LOCATION *</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. Chennai, Tamil Nadu"
                      placeholderTextColor={Theme.textSecondary}
                      value={origin}
                      onChangeText={setOrigin}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
                <View style={styles.routeDivider} />
                <View style={styles.fieldGroup}>
                  <View style={[styles.fieldDot, { backgroundColor: Theme.primary }]} />
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>DROP LOCATION *</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. Delhi, NCR"
                      placeholderTextColor={Theme.textSecondary}
                      value={destination}
                      onChangeText={setDestination}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>VEHICLE TYPE</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {VEHICLE_TYPES.map((v) => (
                    <Pressable
                      key={v}
                      style={[styles.chip, vehicleType === v && styles.chipActive]}
                      onPress={() => setVehicleType(vehicleType === v ? "" : v)}
                    >
                      {vehicleType === v && <Check size={11} color="#fff" strokeWidth={3} />}
                      <Text style={[styles.chipText, vehicleType === v && styles.chipTextActive]}>
                        {v}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.rowFields}>
                <View style={[styles.fieldGroup, styles.halfField]}>
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>WEIGHT (TONNES)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. 20"
                      placeholderTextColor={Theme.textSecondary}
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={[styles.fieldGroup, styles.halfField]}>
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>MATERIAL</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. Steel"
                      placeholderTextColor={Theme.textSecondary}
                      value={material}
                      onChangeText={setMaterial}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>
              <View style={styles.rateSection}>
                <Text style={styles.fieldLabel}>EXPECTED RATE (₹) — OPTIONAL</Text>
                <View style={styles.rateInputRow}>
                  <Text style={styles.ratePrefix}>₹</Text>
                  <TextInput
                    style={styles.rateInput}
                    placeholder="Leave blank to invite bids"
                    placeholderTextColor={Theme.textSecondary}
                    value={rate}
                    onChangeText={setRate}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.fieldLabel}>NOTES</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Loading conditions, special instructions…"
                  placeholderTextColor={Theme.textSecondary}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          )}

          {type === "VEHICLE_AVAILABILITY" && (
            <View style={styles.vehicleForm}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderCopy}>
                  <Text style={styles.sectionKicker}>Fleet availability</Text>
                  <Text style={styles.pickSectionTitle}>Post a vehicle preference</Text>
                </View>
              </View>
              <Text style={styles.sectionSub}>
                Tell the network where equipment is free and what lane you prefer. Pick an idle
                fleet vehicle or enter details manually.
              </Text>

              <View style={styles.orgBadge}>
                <Package size={12} color={Theme.primary} />
                <Text style={styles.orgBadgeText}>{organization?.name}</Text>
              </View>

              <View style={styles.segmentedControl}>
                <Pressable
                  style={[
                    styles.segmentedBtn,
                    vehicleEntryMode === "idle" && styles.segmentedBtnActive,
                  ]}
                  onPress={switchToIdleVehicleEntry}
                >
                  <Truck
                    size={14}
                    color={vehicleEntryMode === "idle" ? Theme.buttonPrimaryText : Theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.segmentedBtnText,
                      vehicleEntryMode === "idle" && styles.segmentedBtnTextActive,
                    ]}
                  >
                    From idle fleet
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.segmentedBtn,
                    vehicleEntryMode === "manual" && styles.segmentedBtnActiveManual,
                  ]}
                  onPress={switchToManualVehicleEntry}
                >
                  <MapPin
                    size={14}
                    color={vehicleEntryMode === "manual" ? Theme.buttonPrimaryText : Theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.segmentedBtnText,
                      vehicleEntryMode === "manual" && styles.segmentedBtnTextActive,
                    ]}
                  >
                    Enter manually
                  </Text>
                </Pressable>
              </View>

              {vehicleEntryMode === "manual" ? (
                <View style={styles.modeBanner}>
                  <Text style={styles.modeBannerText}>Manual availability entry</Text>
                  {vehicleFleetStatus === "ready" ? (
                    <Pressable
                      onPress={switchToIdleVehicleEntry}
                      style={({ pressed }) => [styles.modeBannerAction, pressed && { opacity: 0.8 }]}
                    >
                      <Text style={styles.modeBannerActionText}>← Pick idle vehicle</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {vehicleEntryMode === "idle" ? (
                <View style={styles.formSectionCard}>
                  <Text style={styles.sectionTitle}>SELECT IDLE VEHICLE *</Text>
                  {vehicleFleetStatus === "loading" ? (
                    <View style={styles.loadListLoading}>
                      <LoadingIndicator size="small" color={Theme.primary} />
                      <Text style={styles.loadListLoadingText}>Loading your fleet…</Text>
                    </View>
                  ) : vehicleFleetStatus === "empty" ? (
                    <View style={styles.vehicleEmptyState}>
                      <View style={styles.vehicleEmptyIconWrap}>
                        <Truck size={28} color={Theme.primary} />
                      </View>
                      <Text style={styles.emptyTitle}>No vehicles in your fleet</Text>
                      <Text style={styles.emptySub}>
                        Add a vehicle to your garage to post availability from idle fleet, or enter
                        the details manually below.
                      </Text>
                      <Pressable
                        style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.9 }]}
                        onPress={() => router.push("/(modals)/add-vehicle" as const)}
                      >
                        <Car size={15} color="#fff" />
                        <Text style={styles.emptyCtaText}>Add vehicle</Text>
                      </Pressable>
                      <Pressable
                        onPress={switchToManualVehicleEntry}
                        style={({ pressed }) => [styles.emptySecondary, pressed && { opacity: 0.8 }]}
                      >
                        <Text style={styles.emptySecondaryText}>Enter availability manually</Text>
                      </Pressable>
                    </View>
                  ) : vehicleFleetStatus === "no_idle" ? (
                    <View style={styles.vehicleEmptyState}>
                      <View style={[styles.vehicleEmptyIconWrap, styles.vehicleEmptyIconWrapMuted]}>
                        <Clock size={26} color={Theme.textSecondary} />
                      </View>
                      <Text style={styles.emptyTitle}>No idle vehicles right now</Text>
                      <Text style={styles.emptySub}>
                        All {ownedVehicles.length} fleet vehicle
                        {ownedVehicles.length === 1 ? " is" : "s are"} on trip or unavailable.
                        Enter details manually to post a preference anyway.
                      </Text>
                      <Pressable
                        style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.9 }]}
                        onPress={switchToManualVehicleEntry}
                      >
                        <MapPin size={15} color="#fff" />
                        <Text style={styles.emptyCtaText}>Enter manually</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => router.push(ROUTES.partyDirectory("vehicles"))}
                        style={({ pressed }) => [styles.emptySecondary, pressed && { opacity: 0.8 }]}
                      >
                        <Text style={styles.emptySecondaryText}>View garage</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.vehiclePickHint}>
                        Tap a vehicle to pre-fill type and availability. You can still edit location
                        and lane below.
                      </Text>
                      <View style={styles.idleVehicleGrid}>
                        {idleVehicles.map((v) => {
                          const on = selectedVehicleId === v.id;
                          return (
                            <Pressable
                              key={v.id}
                              style={[styles.idleVehicleCard, on && styles.idleVehicleCardOn]}
                              onPress={() => {
                                setSelectedVehicleId((prev) => {
                                  const next = prev === v.id ? null : v.id;
                                  if (next) {
                                    if (v.vehicle_type?.trim()) setVehicleType(v.vehicle_type.trim());
                                    const vehicleBits = [
                                      v.vehicle_type?.trim(),
                                      v.capacity?.trim(),
                                      v.vehicle_body_type?.trim(),
                                      [v.vehicle_brand?.trim(), v.vehicle_model?.trim()]
                                        .filter(Boolean)
                                        .join(" "),
                                    ].filter(Boolean);
                                    setAvailability(
                                      `Vehicle ${v.vehicle_number} available now${vehicleBits.length ? ` · ${vehicleBits.join(" · ")}` : ""}`,
                                    );
                                  } else {
                                    setVehicleType("");
                                    setAvailability("");
                                  }
                                  return next;
                                });
                              }}
                            >
                              <View style={styles.idleVehicleTop}>
                                <Text style={styles.idleVehicleNumber} numberOfLines={1}>
                                  {v.vehicle_number}
                                </Text>
                                {on ? (
                                  <Check size={12} color={Theme.primary} strokeWidth={3} />
                                ) : (
                                  <View style={styles.idleVehicleIdleDot} />
                                )}
                              </View>
                              <Text style={styles.idleVehicleMeta} numberOfLines={1}>
                                {v.vehicle_type || "Vehicle type not set"}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}
                </View>
              ) : null}

              <View style={styles.formSectionCard}>
                <Text style={styles.formSectionCardTitle}>Location & lane</Text>
                <View style={styles.routeSectionInner}>
                  <View style={styles.fieldGroup}>
                    <View style={[styles.fieldDot, { backgroundColor: "#10b981" }]} />
                    <View style={styles.fieldContent}>
                      <Text style={styles.fieldLabel}>CURRENT LOCATION *</Text>
                      <TextInput
                        style={styles.borderedFieldInput}
                        placeholder="Where is the equipment now?"
                        placeholderTextColor={Theme.textMuted}
                        value={origin}
                        onChangeText={setOrigin}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>
                  <View style={styles.routeDividerHorizontal} />
                  <View style={styles.fieldGroup}>
                    <View style={[styles.fieldDot, { backgroundColor: "#b45309" }]} />
                    <View style={styles.fieldContent}>
                      <Text style={styles.fieldLabel}>PREFERRED LANE (OPTIONAL)</Text>
                      <TextInput
                        style={styles.borderedFieldInput}
                        placeholder="e.g. Delhi → Mumbai"
                        placeholderTextColor={Theme.textMuted}
                        value={destination}
                        onChangeText={setDestination}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>
                </View>
              </View>

              {showManualVehicleFields ? (
                <View style={styles.formSectionCard}>
                  <Text style={styles.sectionTitle}>VEHICLE TYPE *</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {VEHICLE_TYPES.map((v) => (
                      <Pressable
                        key={v}
                        style={[styles.chip, vehicleType === v && styles.chipActiveVehicleType]}
                        onPress={() => setVehicleType(vehicleType === v ? "" : v)}
                      >
                        {vehicleType === v && <Check size={11} color="#fff" strokeWidth={3} />}
                        <Text
                          style={[
                            styles.chipText,
                            vehicleType === v && styles.chipTextActiveVehicle,
                          ]}
                        >
                          {v}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : selectedVehicleId ? (
                <View style={styles.selectedVehicleSummary}>
                  <CheckCircle2 size={14} color={Theme.primary} />
                  <Text style={styles.selectedVehicleSummaryText} numberOfLines={2}>
                    {vehicleType.trim() || "Vehicle"} · availability pre-filled from fleet selection
                  </Text>
                </View>
              ) : null}

              <View style={styles.formSectionCard}>
                <Text style={styles.fieldLabel}>AVAILABILITY *</Text>
                <TextInput
                  style={styles.textareaInput}
                  placeholder="e.g. Free from 6pm today, or 12–15 Apr"
                  placeholderTextColor={Theme.textMuted}
                  value={availability}
                  onChangeText={setAvailability}
                  editable={!(vehicleEntryMode === "idle" && !!selectedVehicleId)}
                />
              </View>

              <View style={styles.formSectionCard}>
                <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={[styles.textareaInput, styles.notesTextarea]}
                  placeholder="Contact preference, terms…"
                  placeholderTextColor={Theme.textMuted}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          )}
            </View>
            {isDesktop ? renderPreviewPanel() : null}
           </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screenBackground },
  canvas: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 10,
  },
  canvasWide: {
    alignSelf: "center",
    maxWidth: 1040,
    paddingHorizontal: 24,
  },
  workspace: {
    width: "100%",
  },
  workspaceWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 28,
  },
  formCol: {
    width: "100%",
    gap: 10,
  },
  formColWide: {
    flex: 1,
    minWidth: 0,
    maxWidth: 620,
    gap: 12,
  },
  previewCol: {
    width: 320,
    gap: 12,
  },
  previewKicker: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginLeft: 2,
  },
  previewCard: {
    backgroundColor: Theme.cardWhite,
    padding: 16,
    paddingLeft: 20,
    gap: 14,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)" } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
    }),
  },
  previewAccentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  previewTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  previewBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  previewExpiry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewExpiryText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  previewRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewCity: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  previewCityMuted: {
    color: Theme.textMuted,
    fontWeight: "600",
  },
  previewChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  previewChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: Theme.surface,
  },
  previewChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  previewChipRate: {
    backgroundColor: Theme.primary + "12",
  },
  previewChipRateText: {
    color: Theme.primary,
    fontWeight: "800",
  },
  previewAvailability: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
    color: Theme.textSecondary,
  },
  previewFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
    paddingTop: 11,
  },
  previewOrgDot: {
    width: 7,
    height: 7,
  },
  previewFooterText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  readinessCard: {
    backgroundColor: Theme.surface,
    padding: 14,
    gap: 9,
  },
  readinessTitle: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  readinessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  readinessLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  readinessLabelDone: {
    color: Theme.textPrimaryDark,
    fontWeight: "700",
  },
  readinessDivider: {
    height: 1,
    backgroundColor: Theme.surfaceBorder,
    marginVertical: 2,
  },
  readinessHintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  readinessHint: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
    color: Theme.textMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  headerDesktop: {
    paddingHorizontal: 22,
  },
  backBtn: {
    width: 36,
    height: 36,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 14,
    fontStyle: "normal",
    fontWeight: "600",
    color: Theme.textPrimary,
    textTransform: "capitalize",
    letterSpacing: 0.1,
  },
  publishBtn: {
    backgroundColor: Theme.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  publishBtnActive: {
    backgroundColor: Theme.primary,
    ...Platform.select({
      web: { boxShadow: "0 4px 12px rgba(37, 99, 235, 0.28)" } as object,
      default: {
        shadowColor: Theme.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
    }),
  },
  publishBtnDisabled: { backgroundColor: "#9ca3af", opacity: 0.55 },
  publishBtnInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  publishBtnText: { fontSize: 12, fontWeight: "800", color: Theme.buttonPrimaryText, letterSpacing: 0.2 },
  hintBox: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.surface,
  },
  hintText: {
    fontSize: 10,
    color: Theme.textSecondary,
    lineHeight: 14,
    fontWeight: "500",
  },
  typeSelector: {
    flexDirection: "row",
    marginTop: 4,
    marginBottom: 10,
    gap: 10,
  },
  typeSelectorDesktop: {
    gap: 12,
  },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    backgroundColor: Theme.screenBackground,
  },
  typeBtnActiveLoad: {
    backgroundColor: "#f59e0b",
  },
  typeBtnActiveVehicle: {
    backgroundColor: Theme.buttonPrimary,
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
    textTransform: "capitalize",
  },
  typeBtnTextActive: { color: Theme.buttonPrimaryText },
  form: { flex: 1 },
  formContent: {
    paddingTop: 10,
    paddingHorizontal: 0,
    width: "100%",
    alignItems: "stretch",
  },
  vehicleModeRow: {
    flexDirection: "row",
    gap: 8,
  },
  vehicleForm: {
    gap: 14,
    width: "100%",
  },
  sectionHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  segmentedControl: {
    flexDirection: "row",
    gap: 8,
    padding: 4,
    backgroundColor: Theme.surface,
  },
  segmentedBtn: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: "transparent",
  },
  segmentedBtnActive: {
    backgroundColor: Theme.buttonPrimary,
  },
  segmentedBtnActiveManual: {
    backgroundColor: Theme.buttonPrimary,
  },
  segmentedBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  segmentedBtnTextActive: {
    color: Theme.buttonPrimaryText,
  },
  formSectionCard: {
    gap: 10,
    padding: 14,
    backgroundColor: Theme.cardWhite,
  },
  formSectionCardTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  routeSectionInner: {
    gap: 0,
  },
  borderedFieldInput: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 20,
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  vehicleEmptyState: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  vehicleEmptyIconWrap: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary + "12",
    marginBottom: 2,
  },
  vehicleEmptyIconWrapMuted: {
    backgroundColor: Theme.surface,
  },
  vehiclePickHint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
    color: Theme.textSecondary,
    marginBottom: 2,
  },
  selectedVehicleSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Theme.primary + "08",
  },
  selectedVehicleSummaryText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  idleVehicleIdleDot: {
    width: 7,
    height: 7,
    backgroundColor: "#10b981",
  },
  notesTextarea: {
    minHeight: 88,
  },
  vehicleModeBtn: {
    flex: 1,
    minHeight: 36,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  vehicleModeBtnActive: {
    backgroundColor: Theme.screenBackground,
  },
  vehicleModeBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  vehicleModeBtnTextActive: {
    color: Theme.textPrimaryDark,
  },
  pickSection: { gap: 8, width: "100%" },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionKicker: {
    ...FinanceTxnTypography.columnTitle,
    marginBottom: 2,
  },
  pickSectionTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 16,
    fontStyle: "normal",
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  sectionSub: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
    marginBottom: 8,
  },
  secondaryLink: { paddingVertical: 4, paddingHorizontal: 2 },
  secondaryLinkText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.primaryText,
    textDecorationLine: "underline",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimary,
    padding: 0,
  },
  loadListLoading: { paddingVertical: 32, alignItems: "center", gap: 10 },
  loadListLoadingText: { fontSize: 12, color: Theme.textSecondary, fontWeight: "600" },
  pickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
  },
  pickGridCell: {
    minWidth: 0,
    alignSelf: "stretch",
  },
  idleVehicleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  idleVehicleCard: {
    width: "49%",
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 5,
    minHeight: 64,
    justifyContent: "center",
  },
  idleVehicleCardOn: {
    backgroundColor: Theme.primary + "10",
  },
  idleVehicleTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  idleVehicleNumber: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  idleVehicleMeta: {
    fontSize: 10,
    color: Theme.textSecondary,
    fontStyle: "italic",
  },
  emptyPick: {
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 12,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: Theme.textPrimary, marginTop: 8 },
  emptySub: { fontSize: 13, color: Theme.textSecondary, textAlign: "center", lineHeight: 20 },
  emptyCta: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.textPrimaryDark,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyCtaText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  emptySecondary: { marginTop: 8, padding: 8 },
  emptySecondaryText: { fontSize: 12, fontWeight: "700", color: Theme.primary },
  notesBlock: { marginTop: 8, gap: 8 },
  modeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.surface,
    padding: 12,
    marginBottom: 8,
  },
  modeBannerText: { fontSize: 12, fontWeight: "800", color: Theme.textPrimary },
  modeBannerAction: { paddingVertical: 4 },
  modeBannerActionText: { fontSize: 12, fontWeight: "800", color: Theme.primary },
  loadForm: { gap: 16 },
  orgBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.primary + "10",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 4,
  },
  orgBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
  },
  routeSection: {
    backgroundColor: "#f7f8fb",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 0,
  },
  fieldGroup: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  routeFieldRow: {
    minHeight: 40,
    justifyContent: "center",
  },
  routeDividerHorizontal: {
    height: 1,
    backgroundColor: Theme.surfaceBorder,
    marginVertical: 10,
  },
  fieldDot: {
    width: 8,
    height: 8,
    marginTop: 28,
  },
  fieldContent: { flex: 1 },
  fieldLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  fieldInput: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderMedium,
    paddingBottom: 6,
  },
  routeDivider: {
    width: 1,
    height: 20,
    backgroundColor: Theme.borderMedium,
    marginLeft: 4,
    marginVertical: 6,
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textMuted,
    letterSpacing: 1,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "#f8fafc",
  },
  chipActive: {
    backgroundColor: Theme.buttonPrimary,
  },
  chipActiveVehicleType: {
    backgroundColor: Theme.buttonPrimary,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  chipTextActive: { color: "#fff" },
  chipTextActiveVehicle: { color: "#fff" },
  rowFields: {
    flexDirection: "row",
    gap: 12,
  },
  halfField: { flex: 1 },
  rateSection: {
    backgroundColor: Theme.primary + "08",
    padding: 14,
    gap: 8,
  },
  rateInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ratePrefix: {
    fontSize: 24,
    fontWeight: "900",
    color: Theme.primary,
  },
  rateInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: -0.5,
  },
  notesInput: {
    fontSize: 14,
    color: Theme.textPrimary,
    fontWeight: "500",
    lineHeight: 20,
    backgroundColor: Theme.surface,
    padding: 12,
    textAlignVertical: "top",
    minHeight: 80,
  },
  textareaInput: {
    fontSize: 14,
    color: Theme.textPrimary,
    fontWeight: "500",
    lineHeight: 20,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlignVertical: "top",
    minHeight: 68,
  },
});
