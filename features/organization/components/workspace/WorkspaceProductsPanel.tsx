/**
 * Workspace Products Panel — enterprise catalogue grid (HubSpot / Zoho style).
 *
 * Desktop: segmented filter + 3-column card grid with icon, category pill,
 * description, dashed rule, and ghost CTA. Mobile: single column, same cards.
 */
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { WorkspaceDetailLayout } from "@/features/organization/components/workspace/WorkspaceDetailLayout";
import {
  WORKSPACE_PANEL_SUBTITLES,
  WORKSPACE_PANEL_TITLES,
} from "@/features/organization/components/workspace/workspacePanelTypes";
import { ProductLogo } from "@/features/organization/components/workspace/ProductLogo";
import {
  canActivate,
  getProduct,
  getProductsInDisplayOrder,
  type BadgeVariant,
  type ProductDefinition,
  type ProductId,
} from "@/lib/productRegistry";
import {
  WORKSPACE_ACCENT,
  WORKSPACE_ACCENT_BORDER,
  WORKSPACE_ELEGANT_BADGE,
} from "@/features/organization/components/workspace/workspaceElegantPalette";
import {
  useJoinWaitlistMutation,
  useWorkspaceProductsQuery,
  useWorkspaceWaitlistQuery,
} from "@/lib/queries/useWorkspaceProductsQuery";
import { AlertCircle, ExternalLink, Lock, Plug, X } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

const NAVY = Theme.primary;
const GRID_GAP = 20;
const CATALOG_MAX_WIDTH = 960;

type CatalogFilter = "all" | "active" | "discover";

const FILTER_OPTIONS: { id: CatalogFilter; label: string }[] = [
  { id: "all", label: "All modules" },
  { id: "active", label: "Active" },
  { id: "discover", label: "Discover" },
];

function gridColumns(contentWidth: number): number {
  if (contentWidth >= 680) return 3;
  if (contentWidth >= 400) return 2;
  return 1;
}

function shortProductName(name: string): string {
  return name.replace(/^Pulse\s+/i, "").trim() || name;
}

function productCategoryLabel(product: ProductDefinition): string {
  const labels: Partial<Record<ProductId, string>> = {
    pulse_core: "Core",
    pulse_pod_pro: "Operations",
    pulse_fleet_pro: "Fleet",
    pulse_finance_pro: "Finance",
    pulse_invoice_pro: "Finance",
    pulse_marketplace: "Network",
    pulse_exchange: "Network",
    pulse_people: "People",
    pulse_talent: "Talent",
    pulse_compliance: "Compliance",
    pulse_ai: "Intelligence",
  };
  return labels[product.id] ?? "Module";
}

function filterProducts(
  products: ProductDefinition[],
  filter: CatalogFilter,
  activeProductIds: Set<ProductId>,
): ProductDefinition[] {
  if (filter === "active") {
    return products.filter(
      (product) => activeProductIds.has(product.id) || product.id === "pulse_core",
    );
  }
  if (filter === "discover") {
    return products.filter(
      (product) => !activeProductIds.has(product.id) && product.id !== "pulse_core",
    );
  }
  return products;
}

// ── Segmented filter ──────────────────────────────────────────────────────────

function CatalogFilterBar({
  value,
  onChange,
}: {
  value: CatalogFilter;
  onChange: (next: CatalogFilter) => void;
}) {
  return (
    <View style={s.filterRow}>
      {FILTER_OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <Pressable
            key={option.id}
            style={s.filterTab}
            onPress={() => onChange(option.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[s.filterTabText, selected && s.filterTabTextActive]}>
              {option.label}
            </Text>
            {selected ? <View style={s.filterTabIndicator} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function StatusBadge({ label, variant }: { label: string; variant: BadgeVariant }) {
  const colors = WORKSPACE_ELEGANT_BADGE[variant];
  return (
    <View
      style={[
        s.badge,
        { backgroundColor: colors.bg, borderColor: colors.border },
      ]}
    >
      <Text style={[s.badgeText, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

// ── Product card (reference layout) ───────────────────────────────────────────

interface ProductCardProps {
  product: ProductDefinition;
  isActive: boolean;
  isOnWaitlist: boolean;
  activeProductIds: Set<ProductId>;
  onJoinWaitlist: (product: ProductDefinition) => void;
  onManage: (product: ProductDefinition) => void;
}

function ProductCatalogCard({
  product,
  isActive,
  isOnWaitlist,
  activeProductIds,
  onJoinWaitlist,
  onManage,
}: ProductCardProps) {
  const isPulseCore = product.id === "pulse_core";
  const canBeActivated = canActivate(product.id, activeProductIds);
  const missingDeps = product.dependencies.filter((d) => !activeProductIds.has(d));

  const ctaLabel = useMemo(() => {
    if (isPulseCore) return "Included in workspace";
    if (isActive) return "Manage module";
    if (isOnWaitlist) return "On waitlist";
    if (product.status === "active") return "Start trial";
    return "Learn more";
  }, [isPulseCore, isActive, isOnWaitlist, product.status]);

  const ctaDisabled = isPulseCore || isOnWaitlist;
  const ctaAction = isActive ? () => onManage(product) : () => onJoinWaitlist(product);

  return (
    <View style={[s.card, isActive && s.cardActive]}>
      <View style={s.cardBody}>
        <View style={s.cardTopRow}>
          <ProductLogo productId={product.id} size={44} active={isActive || isPulseCore} />
          <View style={s.cardTopRight}>
            <View style={s.categoryPill}>
              <Text style={s.categoryPillText}>{productCategoryLabel(product)}</Text>
            </View>
            <Pressable
              onPress={ctaDisabled ? undefined : ctaAction}
              disabled={ctaDisabled}
              style={({ pressed }) => [s.externalBtn, pressed && { opacity: 0.7 }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Open ${product.name}`}
            >
              <ExternalLink size={15} color={Theme.textMuted} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        <Text style={s.cardTitle}>{shortProductName(product.name)}</Text>
        <Text style={s.cardDescription} numberOfLines={2}>
          {product.description}
        </Text>

        {product.badge ? (
          <View style={s.badgeRow}>
            <StatusBadge label={product.badge.label} variant={product.badge.variant} />
          </View>
        ) : isActive && !isPulseCore ? (
          <View style={s.badgeRow}>
            <StatusBadge label="Active" variant="green" />
          </View>
        ) : isPulseCore ? (
          <View style={s.badgeRow}>
            <StatusBadge label="Included" variant="indigo" />
          </View>
        ) : null}

        {!canBeActivated && missingDeps.length > 0 ? (
          <View style={s.depWarn}>
            <AlertCircle size={13} color={Theme.textMuted} strokeWidth={2} />
            <Text style={s.depWarnText} numberOfLines={2}>
              Requires {missingDeps.map((d) => shortProductName(getProduct(d).name)).join(", ")}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={s.cardFooter}>
        <View style={s.cardDivider} />
        <View style={s.footerRow}>
          <Pressable
            onPress={ctaDisabled ? undefined : ctaAction}
            disabled={ctaDisabled}
            style={({ pressed }) => [
              s.connectBtn,
              ctaDisabled && s.connectBtnDisabled,
              pressed && !ctaDisabled && s.connectBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
          >
            <Plug size={13} color={isActive ? NAVY : Theme.textSecondary} strokeWidth={2.2} />
            <Text
              style={[
                s.connectBtnText,
                ctaDisabled && s.connectBtnTextDisabled,
                isActive && !isPulseCore && s.connectBtnTextActive,
              ]}
            >
              {ctaLabel}
            </Text>
          </Pressable>
          <Switch
            value={isActive || isPulseCore}
            disabled={isPulseCore || ctaDisabled}
            onValueChange={() => {
              if (!ctaDisabled) ctaAction();
            }}
            trackColor={{ false: "#e4e6ef", true: "rgba(79,70,229,0.35)" }}
            thumbColor={isActive || isPulseCore ? NAVY : "#f4f4f5"}
            ios_backgroundColor="#e4e6ef"
            accessibilityLabel={`${product.name} enabled`}
          />
        </View>
      </View>
    </View>
  );
}

function ProductCatalogGrid({
  products,
  activeProductIds,
  waitlistedProductIds,
  columns,
  onJoinWaitlist,
  onManage,
}: {
  products: ProductDefinition[];
  activeProductIds: Set<ProductId>;
  waitlistedProductIds: Set<ProductId>;
  columns: number;
  onJoinWaitlist: (product: ProductDefinition) => void;
  onManage: (product: ProductDefinition) => void;
}) {
  const cellStyle = useMemo(
    () => [
      s.productGridCell,
      columns === 3 && s.productGridCellThird,
      columns === 2 && s.productGridCellHalf,
      columns === 1 && s.productGridCellFull,
    ],
    [columns],
  );

  if (products.length === 0) {
    return (
      <View style={s.emptyWrap}>
        <Text style={s.emptyTitle}>No modules in this view</Text>
        <Text style={s.emptyBody}>Try another filter to browse the Pulse catalogue.</Text>
      </View>
    );
  }

  return (
    <View style={s.productGrid}>
      {products.map((product) => (
        <View key={product.id} style={cellStyle}>
          <ProductCatalogCard
            product={product}
            isActive={activeProductIds.has(product.id)}
            isOnWaitlist={waitlistedProductIds.has(product.id)}
            activeProductIds={activeProductIds}
            onJoinWaitlist={onJoinWaitlist}
            onManage={onManage}
          />
        </View>
      ))}
    </View>
  );
}

// ── Waitlist modal ────────────────────────────────────────────────────────────

interface WaitlistModalProps {
  product: ProductDefinition | null;
  onClose: () => void;
  onSubmit: (data: { email: string; fleetSize: string; useCase: string }) => Promise<void>;
  submitting: boolean;
}

const FLEET_SIZES = ["1-5 trucks", "6-20 trucks", "21-50 trucks", "50+ trucks"];

function WaitlistModal({ product, onClose, onSubmit, submitting }: WaitlistModalProps) {
  const { user, profile } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [fleetSize, setFleetSize] = useState("");
  const [useCase, setUseCase] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }
    try {
      await onSubmit({ email: email.trim(), fleetSize, useCase: useCase.trim() });
      setSubmitted(true);
    } catch {
      Alert.alert("Error", "Could not submit. Please try again.");
    }
  };

  if (!product) return null;

  return (
    <Modal
      visible={!!product}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalCard}>
          {submitted ? (
            <View style={s.successWrap}>
              <ProductLogo productId={product.id} size={44} active />
              <Text style={s.successTitle}>You&apos;re on the list!</Text>
              <Text style={s.successBody}>
                We&apos;ll reach out when {product.name} is ready for your
                organisation. We usually invite in small batches to ensure quality.
              </Text>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [s.successBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={s.successBtnText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Modal header */}
              <View style={s.modalHeader}>
                <ProductLogo productId={product.id} size={40} active />
                <View style={s.modalHeaderText}>
                  <Text style={s.modalTitle}>{product.name}</Text>
                  {product.badge ? (
                    <StatusBadge
                      label={product.badge.label}
                      variant={product.badge.variant}
                    />
                  ) : null}
                </View>
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  style={({ pressed }) => [s.modalClose, pressed && { opacity: 0.7 }]}
                >
                  <X size={14} color={Theme.textMuted} strokeWidth={2.4} />
                </Pressable>
              </View>

              <Text style={s.modalVision}>{product.vision}</Text>

              {/* Form */}
              <View style={s.modalForm}>
                <Text style={s.formLabel}>Your email *</Text>
                <TextInput
                  style={s.formInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@company.com"
                  placeholderTextColor={Theme.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={s.formLabel}>Fleet size</Text>
                <View style={s.chipRow}>
                  {FLEET_SIZES.map((size) => (
                    <Pressable
                      key={size}
                      onPress={() => setFleetSize(size === fleetSize ? "" : size)}
                      style={[s.chip, fleetSize === size && s.chipSelected]}
                    >
                      <Text
                        style={[s.chipText, fleetSize === size && s.chipTextSelected]}
                      >
                        {size}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={s.formLabel}>What will you use it for? (optional)</Text>
                <TextInput
                  style={[s.formInput, s.formTextarea]}
                  value={useCase}
                  onChangeText={setUseCase}
                  placeholder="e.g. Track all our e-way bills automatically…"
                  placeholderTextColor={Theme.textMuted}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              <Pressable
                onPress={() => void handleSubmit()}
                disabled={submitting}
                style={({ pressed }) => [
                  s.submitBtn,
                  submitting && { opacity: 0.7 },
                  pressed && !submitting && { opacity: 0.9 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.submitBtnText}>Request Early Access</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type Props = {
  onBack: () => void;
};

export function WorkspaceProductsPanel({ onBack }: Props) {
  const { width: viewportWidth } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState(viewportWidth);
  const columns = gridColumns(contentWidth);

  const { data: activations = [], isLoading: loadingActivations } =
    useWorkspaceProductsQuery();
  const { data: waitlistEntries = [], isLoading: loadingWaitlist } =
    useWorkspaceWaitlistQuery();
  const { mutateAsync: joinWaitlist, isPending: joiningWaitlist } =
    useJoinWaitlistMutation();

  const [waitlistTarget, setWaitlistTarget] = useState<ProductDefinition | null>(null);
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");

  const activeProductIds = useMemo<Set<ProductId>>(() => {
    const ids = new Set<ProductId>();
    for (const a of activations) {
      if (a.status === "active" || a.status === "trial") {
        ids.add(a.product_id);
      }
    }
    ids.add("pulse_core");
    return ids;
  }, [activations]);

  const waitlistedProductIds = useMemo<Set<ProductId>>(() => {
    const s = new Set<ProductId>();
    for (const w of waitlistEntries) {
      s.add(w.product_id);
    }
    return s;
  }, [waitlistEntries]);

  const allProducts = useMemo(() => getProductsInDisplayOrder(), []);
  const filteredProducts = useMemo(
    () => filterProducts(allProducts, catalogFilter, activeProductIds),
    [allProducts, catalogFilter, activeProductIds],
  );

  const handleJoinWaitlist = useCallback((product: ProductDefinition) => {
    setWaitlistTarget(product);
  }, []);

  const handleManage = useCallback((product: ProductDefinition) => {
    Alert.alert(
      product.name,
      "Billing management portal coming soon. Contact your account manager to modify your subscription.",
      [{ text: "OK" }],
    );
  }, []);

  const handleWaitlistSubmit = useCallback(
    async ({
      email,
      fleetSize,
      useCase,
    }: {
      email: string;
      fleetSize: string;
      useCase: string;
    }) => {
      if (!waitlistTarget) return;
      await joinWaitlist({
        productId: waitlistTarget.id,
        email,
        fleetSize: fleetSize || undefined,
        useCase: useCase || undefined,
      });
    },
    [waitlistTarget, joinWaitlist],
  );

  const loading = loadingActivations || loadingWaitlist;

  return (
    <>
      <WorkspaceDetailLayout
        title={WORKSPACE_PANEL_TITLES.products}
        subtitle={WORKSPACE_PANEL_SUBTITLES.products}
        onBack={onBack}
        contentMaxWidth={CATALOG_MAX_WIDTH}
      >
        <View
          style={s.catalogShell}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.width);
            if (next > 0 && next !== contentWidth) setContentWidth(next);
          }}
        >
          <CatalogFilterBar value={catalogFilter} onChange={setCatalogFilter} />

          <Text style={s.catalogIntro}>
            {filteredProducts.length} module{filteredProducts.length === 1 ? "" : "s"} ·{" "}
            {activeProductIds.size} connected
          </Text>

          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={NAVY} />
            </View>
          ) : (
            <ProductCatalogGrid
              products={filteredProducts}
              activeProductIds={activeProductIds}
              waitlistedProductIds={waitlistedProductIds}
              columns={columns}
              onJoinWaitlist={handleJoinWaitlist}
              onManage={handleManage}
            />
          )}

          <View style={s.footerNote}>
            <Lock size={11} color={Theme.textMuted} strokeWidth={2} />
            <Text style={s.footerNoteText}>
              All product data is stored securely in your Pulse workspace. Pricing is in
              INR and exclusive of GST.
            </Text>
          </View>
        </View>
      </WorkspaceDetailLayout>

      <WaitlistModal
        product={waitlistTarget}
        onClose={() => setWaitlistTarget(null)}
        onSubmit={handleWaitlistSubmit}
        submitting={joiningWaitlist}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  catalogShell: {
    width: "100%",
    gap: 20,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingBottom: 0,
  },
  filterTab: {
    position: "relative",
    paddingBottom: 12,
    paddingTop: 4,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  filterTabTextActive: {
    color: Theme.primary,
    fontWeight: "600",
  },
  filterTabIndicator: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.primary,
  },

  catalogIntro: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 18,
  },

  loadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
  },

  emptyWrap: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  emptyBody: {
    fontSize: 12,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },

  productGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
    alignItems: "stretch",
  },
  productGridCell: {
    minWidth: 0,
    alignSelf: "stretch",
  },
  productGridCellThird: {
    flexGrow: 1,
    flexBasis: "31%",
    maxWidth: "33.333%",
    minWidth: 200,
  },
  productGridCellHalf: {
    flexGrow: 1,
    flexBasis: "47%",
    maxWidth: "50%",
    minWidth: 180,
  },
  productGridCellFull: {
    width: "100%",
    flexBasis: "100%",
    maxWidth: "100%",
  },

  card: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eff2f5",
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 0,
    ...Platform.select({
      web: { boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" as unknown as undefined },
    }),
  },
  cardActive: {
    borderColor: WORKSPACE_ACCENT_BORDER,
  },
  cardBody: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 16,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  cardTopRight: {
    alignItems: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  externalBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  categoryPill: {
    borderRadius: 6,
    backgroundColor: "#f1f4f9",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 22,
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "400",
    color: Theme.textSecondary,
    minHeight: 40,
  },
  badgeRow: {
    marginTop: 12,
  },
  cardFooter: {
    marginTop: "auto",
  },
  cardDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eff2f5",
    width: "100%",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
  },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#e4e6ef",
    borderStyle: Platform.OS === "web" ? "dashed" : "solid",
    backgroundColor: Theme.cardWhite,
    flexShrink: 1,
  },
  connectBtnDisabled: {
    opacity: 0.55,
  },
  connectBtnPressed: {
    backgroundColor: "#f9fafb",
  },
  connectBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  connectBtnTextDisabled: {
    color: Theme.textMuted,
  },
  connectBtnTextActive: {
    color: NAVY,
  },

  depWarn: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Theme.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  depWarnText: {
    flex: 1,
    fontSize: 11,
    color: Theme.textSecondary,
    fontWeight: "600",
    lineHeight: 15,
  },

  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },

  footerNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    padding: 14,
    marginTop: 4,
  },
  footerNoteText: {
    flex: 1,
    fontSize: 11,
    color: Theme.textMuted,
    lineHeight: 16,
  },

  // Waitlist modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    gap: 14,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeaderText: {
    flex: 1,
    gap: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  modalClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  modalVision: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 20,
  },
  modalForm: {
    gap: 10,
  },
  formLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  formInput: {
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  formTextarea: {
    minHeight: 70,
    paddingTop: 12,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  chipSelected: {
    backgroundColor: "rgba(79,70,229,0.1)",
    borderColor: "rgba(79,70,229,0.3)",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  chipTextSelected: {
    color: NAVY,
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    backgroundColor: WORKSPACE_ACCENT,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.4,
  },

  // Success state
  successWrap: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
  },
  successIcon: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  successBody: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  successBtn: {
    backgroundColor: WORKSPACE_ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginTop: 8,
  },
  successBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.4,
  },
});
