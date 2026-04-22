import Theme from "@/constants/Theme";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";

type EditPanel = "BASIC" | "WAREHOUSES" | "CONTRACTS" | "KYC";

type EditTab = {
  id: EditPanel;
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
};

export type ProfileWarehouse = {
  id: string;
  name: string;
  address: string;
  gstNumber?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
};

export type ProfileContract = {
  id: string;
  pickup: string;
  destination: string;
  price: number;
  pricingType: "per_trip" | "per_ton";
  loadingIncluded?: boolean;
  unloadingIncluded?: boolean;
  notes?: string | null;
};

export type ProfileKycDoc = {
  id: string;
  documentType: string;
  status: "Verified" | "Pending";
  dateLabel?: string | null;
};

export type CounterpartyProfileSystemCardProps = {
  /** Reset internal view/edit mode when modal closes */
  visible: boolean;
  type: "client" | "supplier";
  organizationName: string;
  adminName?: string | null;
  email?: string | null;
  phone?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  billingAddress?: string | null;
  gridVolumeLabel?: string;
  /** e.g. "94.2%" or health-derived */
  networkTrustLabel?: string;
  isIntegrated?: boolean;
  entityDisplayId?: string | null;
  warehouses?: ProfileWarehouse[];
  contracts?: ProfileContract[];
  kycDocs?: ProfileKycDoc[];
  onClose: () => void;
  /** Opens full edit flow (router / modal) */
  onEditPress?: () => void;
};

function completionPercent(input: {
  organizationName: string;
  adminName?: string | null;
  email?: string | null;
  phone?: string | null;
  gstNumber?: string | null;
  billingAddress?: string | null;
  warehouses?: ProfileWarehouse[];
  contracts?: ProfileContract[];
  kycDocs?: ProfileKycDoc[];
}): number {
  let score = 0;
  let total = 6;
  if (input.organizationName.trim()) score += 1;
  if ((input.adminName ?? "").trim()) score += 1;
  if ((input.email ?? "").trim()) score += 1;
  if ((input.phone ?? "").trim()) score += 1;
  if ((input.gstNumber ?? "").trim()) score += 1;
  if ((input.billingAddress ?? "").trim()) score += 1;
  if ((input.warehouses?.length ?? 0) > 0) {
    score += 1;
    total += 1;
  }
  if ((input.contracts?.length ?? 0) > 0) {
    score += 1;
    total += 1;
  }
  if ((input.kycDocs?.length ?? 0) > 0) {
    score += 1;
    total += 1;
  }
  return Math.max(10, Math.min(100, Math.round((score / total) * 100)));
}

function Badge({
  children,
  variant = "gray",
}: {
  children: ReactNode;
  variant?: "green" | "blue" | "orange" | "gray" | "red";
}) {
  const palette = {
    green: {
      bg: Theme.positiveMuted,
      border: Theme.positive + "44",
      text: Theme.positive,
    },
    blue: {
      bg: Theme.fiscalTabActiveBg,
      border: Theme.aggregatePillBorder,
      text: Theme.aggregatePillText,
    },
    orange: {
      bg: Theme.warningMuted,
      border: Theme.warning + "55",
      text: Theme.warning,
    },
    gray: {
      bg: Theme.surfaceGray,
      border: Theme.borderMedium,
      text: Theme.textMuted,
    },
    red: {
      bg: Theme.negativeMuted,
      border: Theme.negative + "44",
      text: Theme.negative,
    },
  }[variant];

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.badgeText, { color: palette.text }]}>{children}</Text>
    </View>
  );
}

export function CounterpartyProfileSystemCard({
  visible,
  type,
  organizationName,
  adminName,
  email,
  phone,
  gstNumber,
  panNumber,
  billingAddress,
  gridVolumeLabel,
  networkTrustLabel = "94.2%",
  isIntegrated,
  entityDisplayId,
  warehouses = [],
  contracts = [],
  kycDocs = [],
  onClose,
  onEditPress,
}: CounterpartyProfileSystemCardProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 900;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editPanel, setEditPanel] = useState<EditPanel>("BASIC");

  const [draftName, setDraftName] = useState(organizationName);
  const [draftGst, setDraftGst] = useState((gstNumber ?? "").trim());
  const [draftPan, setDraftPan] = useState((panNumber ?? "").trim());
  const [draftBilling, setDraftBilling] = useState((billingAddress ?? "").trim());

  useEffect(() => {
    if (!visible) {
      setMode("view");
      setEditPanel("BASIC");
    }
  }, [visible]);

  useEffect(() => {
    setDraftName(organizationName);
    setDraftGst((gstNumber ?? "").trim());
    setDraftPan((panNumber ?? "").trim());
    setDraftBilling((billingAddress ?? "").trim());
  }, [organizationName, gstNumber, panNumber, billingAddress]);

  const completion = useMemo(
    () =>
      completionPercent({
        organizationName,
        adminName,
        email,
        phone,
        gstNumber,
        billingAddress,
        warehouses,
        contracts,
        kycDocs,
      }),
    [
      organizationName,
      adminName,
      email,
      phone,
      gstNumber,
      billingAddress,
      warehouses,
      contracts,
      kycDocs,
    ],
  );

  const initials = useMemo(() => {
    const src = organizationName.trim() || (type === "client" ? "CL" : "SP");
    return src
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("");
  }, [organizationName, type]);

  const shortId = useMemo(() => {
    const raw = (entityDisplayId ?? "").trim();
    if (raw) return raw.replace(/^#/, "");
    return "";
  }, [entityDisplayId]);

  const typeBadge = type === "client" ? "client" : "supplier";

  const handleSynchronize = () => {
    onEditPress?.();
    setMode("view");
  };

  const editTabs = useMemo(() => {
    const base: EditTab[] = [{ id: "BASIC", label: "Basic Information", icon: "info-circle" }];
    if (type === "client") {
      base.push(
        { id: "WAREHOUSES", label: "Operations Hubs", icon: "archive" },
        { id: "CONTRACTS", label: "Route Contracts", icon: "file-text" },
      );
    } else {
      base.push({ id: "KYC", label: "Verification Vault", icon: "shield" });
    }
    return base;
  }, [type]);

  if (mode === "edit") {
    return (
      <View style={[styles.editorRoot, { paddingTop: insets.top }]}>
        <View style={styles.editorHeader}>
          <View style={styles.editorHeaderLeft}>
            <TouchableOpacity
              onPress={() => setMode("view")}
              style={styles.iconBtn}
              hitSlop={10}
              accessibilityLabel="Back to profile"
            >
              <FontAwesome name="chevron-left" size={22} color={Theme.textPrimaryDark} />
            </TouchableOpacity>
            <View>
              <Text style={styles.editorTitle}>Modify Business Identity</Text>
              <Text style={styles.editorSubtitle}>{organizationName}</Text>
            </View>
          </View>
          <View style={styles.editorHeaderActions}>
            <TouchableOpacity style={styles.discardBtn} onPress={() => setMode("view")}>
              <Text style={styles.discardBtnText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.syncBtn} onPress={handleSynchronize}>
              <Text style={styles.syncBtnText}>Synchronize Hub</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.editorBody, !isWide && styles.editorBodyColumn]}>
          <ScrollView
            horizontal={!isWide}
            showsHorizontalScrollIndicator={false}
            style={isWide ? styles.editorAside : styles.editorTabsRow}
            contentContainerStyle={isWide ? styles.editorAsideContent : styles.editorTabsRowContent}
          >
            {editTabs.map((tab) => {
              const active = editPanel === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.editorTab,
                    active && styles.editorTabActive,
                    !isWide && styles.editorTabPill,
                    isWide && styles.editorTabFullWidth,
                  ]}
                  onPress={() => setEditPanel(tab.id)}
                  activeOpacity={0.85}
                >
                  <FontAwesome
                    name={tab.icon}
                    size={18}
                    color={active ? Theme.textOnPrimary : Theme.textMuted}
                  />
                  <Text style={[styles.editorTabLabel, active && styles.editorTabLabelActive]}>
                    {tab.label}
                  </Text>
                  {active ? <View style={styles.editorTabPulse} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView
            style={styles.editorMain}
            contentContainerStyle={styles.editorMainContent}
            showsVerticalScrollIndicator={false}
          >
            {editPanel === "BASIC" && (
              <View style={styles.editSection}>
                <View style={styles.editSectionBarIndigo} />
                <Text style={styles.editSectionTitle}>Core Identity</Text>
                <Text style={styles.editSectionHint}>Official business and tax records</Text>
                <Text style={styles.fieldLabel}>Legal Organization Name</Text>
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  style={styles.fieldInputLarge}
                  placeholder="Entity legal name"
                  placeholderTextColor={Theme.textSection}
                />
                <Text style={styles.fieldLabel}>Registered GSTIN</Text>
                <TextInput
                  value={draftGst}
                  onChangeText={setDraftGst}
                  style={styles.fieldInputLarge}
                  placeholder="33XXXXX..."
                  placeholderTextColor={Theme.textSection}
                  autoCapitalize="characters"
                />
                {type === "client" ? (
                  <>
                    <Text style={styles.fieldLabel}>PAN Registry</Text>
                    <TextInput
                      value={draftPan}
                      onChangeText={setDraftPan}
                      style={styles.fieldInputLarge}
                      placeholder="PAN"
                      placeholderTextColor={Theme.textSection}
                      autoCapitalize="characters"
                    />
                  </>
                ) : null}
                <Text style={styles.fieldLabel}>Billing Headquarters Address</Text>
                <TextInput
                  value={draftBilling}
                  onChangeText={setDraftBilling}
                  style={styles.fieldInputArea}
                  placeholder="Registered billing address"
                  placeholderTextColor={Theme.textSection}
                  multiline
                />
              </View>
            )}

            {editPanel === "WAREHOUSES" && type === "client" && (
              <View style={styles.editSection}>
                <View style={styles.editSectionRow}>
                  <View style={styles.editSectionBarAmber} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editSectionTitle}>Operations Hubs</Text>
                    <Text style={styles.editSectionHint}>Register pickup and distribution nodes</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.smallCtaAmber}
                    onPress={() => Alert.alert("Register hub", "Warehouse registration will sync when backend tables are live.")}
                  >
                    <FontAwesome name="plus" size={14} color={Theme.warning} />
                    <Text style={styles.smallCtaAmberText}>Register Hub</Text>
                  </TouchableOpacity>
                </View>
                {warehouses.length === 0 ? (
                  <Text style={styles.emptyMuted}>No hubs yet. Add from fleet settings when available.</Text>
                ) : (
                  warehouses.map((wh) => (
                    <View key={wh.id} style={styles.hubEditCard}>
                      <View style={styles.hubEditTop}>
                        <View style={styles.hubEditIcon}>
                          <FontAwesome name="archive" size={22} color={Theme.aggregatePillText} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.hubEditName}>{wh.name}</Text>
                          <View style={styles.localGstPill}>
                            <Text style={styles.localGstPillText}>
                              Local GST: {(wh.gstNumber ?? "").trim() || "—"}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => Alert.alert("Edit hub", "Editing warehouses will be available with profile sync.")}
                          style={styles.iconBtnGhost}
                        >
                          <FontAwesome name="pencil" size={16} color={Theme.textMuted} />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.hubEditGrid}>
                        <View style={styles.hubEditCol}>
                          <FontAwesome name="map-marker" size={16} color={Theme.aggregatePillText} />
                          <Text style={styles.hubEditAddr}>{wh.address}</Text>
                        </View>
                        <View style={[styles.hubEditCol, styles.hubEditColRight]}>
                          <FontAwesome name="user" size={16} color={Theme.positive} />
                          <Text style={styles.hubEditContact}>{(wh.contactPerson ?? "").trim() || "—"}</Text>
                          <Text style={styles.hubEditPhone}>{(wh.phone ?? "").trim() || "—"}</Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {editPanel === "CONTRACTS" && type === "client" && (
              <View style={styles.editSection}>
                <View style={styles.editSectionRow}>
                  <View style={styles.editSectionBarNavy} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editSectionTitle}>Route Contracts</Text>
                    <Text style={styles.editSectionHint}>Defined lane protocols and rate cards</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.smallCtaNavy}
                    onPress={() =>
                      Alert.alert("Define lane contract", "Contract authoring will connect to the contracts table when live.")
                    }
                  >
                    <FontAwesome name="plus" size={14} color={Theme.textOnPrimary} />
                    <Text style={styles.smallCtaNavyText}>Define Lane</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.contractTableWrap}>
                  <View style={styles.contractTableHead}>
                    <Text style={[styles.contractTh, { flex: 1.1 }]}>Hub (Pickup)</Text>
                    <Text style={[styles.contractTh, { flex: 1 }]}>Destination</Text>
                    <Text style={[styles.contractTh, styles.contractThCenter, { width: 88 }]}>Pricing</Text>
                    <Text style={[styles.contractTh, styles.contractThRight, { width: 96 }]}>Lane Rate</Text>
                  </View>
                  {contracts.length === 0 ? (
                    <Text style={styles.emptyMutedPadded}>No contracts. Derived lanes will appear here from trip history.</Text>
                  ) : (
                    contracts.map((cnt) => (
                      <View key={cnt.id} style={styles.contractTr}>
                        <Text style={[styles.contractTdPickup, { flex: 1.1 }]} numberOfLines={2}>
                          {cnt.pickup}
                        </Text>
                        <View style={[styles.contractTdDestWrap, { flex: 1 }]}>
                          <View style={styles.contractDestRule} />
                          <Text style={styles.contractTdDest} numberOfLines={2}>
                            {cnt.destination}
                          </Text>
                        </View>
                        <View style={[styles.contractPricingCol, { width: 88 }]}>
                          <View
                            style={[
                              styles.perPill,
                              cnt.pricingType === "per_trip" ? styles.perPillTrip : styles.perPillTon,
                            ]}
                          >
                            <Text
                              style={[
                                styles.perPillText,
                                cnt.pricingType === "per_trip" ? styles.perPillTextTrip : styles.perPillTextTon,
                              ]}
                            >
                              Per {cnt.pricingType === "per_trip" ? "TRIP" : "TON"}
                            </Text>
                          </View>
                          <Text style={styles.laborHint}>
                            {cnt.loadingIncluded ? "Labor Incl." : "Excl. Labor"}
                          </Text>
                        </View>
                        <View style={{ width: 96, alignItems: "flex-end" }}>
                          <Text style={styles.laneRate}>₹{Math.round(cnt.price).toLocaleString("en-IN")}</Text>
                          {!!(cnt.notes ?? "").trim() && (
                            <Text style={styles.laneNotes} numberOfLines={2}>
                              {cnt.notes}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}

            {editPanel === "KYC" && type === "supplier" && (
              <View style={styles.editSection}>
                <View style={styles.editSectionBarEmerald} />
                <Text style={styles.editSectionTitle}>Verification Vault</Text>
                <Text style={styles.editSectionHint}>Supplier regulatory compliance records</Text>
                {kycDocs.map((doc) => (
                  <View key={doc.id} style={styles.kycVaultCard}>
                    <View style={styles.kycVaultLeft}>
                      <View
                        style={[
                          styles.kycVaultIcon,
                          doc.status === "Verified" ? styles.kycVaultIconOk : styles.kycVaultIconPending,
                        ]}
                      >
                        <FontAwesome
                          name={doc.status === "Verified" ? "clipboard" : "cloud-upload"}
                          size={22}
                          color={doc.status === "Verified" ? Theme.positive : Theme.textMuted}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.kycVaultTitle}>{doc.documentType}</Text>
                        <View style={styles.kycVaultMeta}>
                          <Badge variant={doc.status === "Verified" ? "green" : "orange"}>{doc.status}</Badge>
                          <Text style={styles.kycVaultDate}>
                            Modified: {(doc.dateLabel ?? "").trim() || "—"}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.kycUpdateBtn}
                      onPress={() => Alert.alert("Update file", "Document upload will use supplier KYC storage when live.")}
                    >
                      <Text style={styles.kycUpdateBtnText}>Update File</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.viewRoot, { paddingTop: insets.top }]}>
      <View style={styles.viewStickyHeader}>
        <View style={styles.viewStickyLeft}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={12} accessibilityLabel="Close profile">
            <FontAwesome name="chevron-left" size={22} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
          <Text style={styles.viewStickyTitle}>Partner Profile</Text>
        </View>
        <View style={styles.viewStickyRight}>
          <Badge variant={type === "client" ? "blue" : "orange"}>{typeBadge}</Badge>
          <TouchableOpacity style={styles.editProfileBtn} onPress={() => setMode("edit")} activeOpacity={0.9}>
            <FontAwesome name="pencil" size={14} color={Theme.textOnPrimary} />
            <Text style={styles.editProfileBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.viewScroll}
        contentContainerStyle={styles.viewScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.identityCard}>
          <View style={styles.identityBlob} />
          <View style={styles.avatarRing}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.identityName} numberOfLines={3}>
            {organizationName}
          </Text>
          {shortId ? (
            <Text style={styles.identityId}>#{shortId}</Text>
          ) : null}
          <View style={styles.identityBadgeRow}>
            <View style={styles.pillEmerald}>
              <Text style={styles.pillEmeraldText}>Active Profile</Text>
            </View>
            <View style={[styles.pillIndigo, !isIntegrated && styles.pillIndigoMuted]}>
              <Text style={[styles.pillIndigoText, !isIntegrated && styles.pillIndigoTextMuted]}>
                {isIntegrated ? "Integrated Node" : "Core Node"}
              </Text>
            </View>
          </View>

          <View style={styles.completionBlock}>
            <View style={styles.completionHead}>
              <Text style={styles.completionLabel}>Profile Readiness</Text>
              <Text style={styles.completionPct}>{completion}%</Text>
            </View>
            <View style={styles.completionTrack}>
              <LinearGradient
                colors={[Theme.primaryLight, Theme.positive]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.completionFill, { width: `${completion}%` }]}
              />
            </View>
          </View>

          <View style={styles.kpiGrid}>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiTileLabel}>Business Volume</Text>
              <Text style={styles.kpiTileValue}>{gridVolumeLabel ?? "₹0"}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiTileLabel}>Network Trust</Text>
              <Text style={[styles.kpiTileValue, { color: Theme.positive }]}>{networkTrustLabel}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.twoCol, !isWide && styles.twoColStack]}>
          <View style={styles.colBlock}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.accentIndigo} />
              <Text style={styles.sectionHeading}>Admin Registry</Text>
            </View>
            <View style={styles.registryCard}>
              {[
                { label: "Admin Name", value: (adminName ?? "").trim() || "—", icon: "user" as const },
                { label: "Email Link", value: (email ?? "").trim() || "—", icon: "envelope" as const },
                { label: "Phone Registry", value: (phone ?? "").trim() || "—", icon: "phone" as const },
              ].map((item) => (
                <View key={item.label} style={styles.registryRow}>
                  <View style={styles.registryIconWrap}>
                    <FontAwesome name={item.icon} size={22} color={Theme.textMuted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.registryLabel}>{item.label}</Text>
                    <Text style={styles.registryValue} numberOfLines={3}>
                      {item.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.colBlock}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.accentEmerald} />
              <Text style={styles.sectionHeading}>Tax Identity</Text>
            </View>
            <View style={styles.registryCard}>
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.taxLabel}>Registered GSTIN</Text>
                <Text style={styles.taxGst}>{(gstNumber ?? "").trim() || "Not Configured"}</Text>
              </View>
              {type === "client" && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.taxLabel}>PAN Registry</Text>
                  <Text style={styles.taxPan}>{(panNumber ?? "").trim() || "—"}</Text>
                </View>
              )}
              <View>
                <Text style={styles.taxLabel}>Billing Address</Text>
                <Text style={styles.taxBilling}>{(billingAddress ?? "").trim() || "Not Configured"}</Text>
              </View>
            </View>
          </View>
        </View>

        {type === "client" && (
          <View style={styles.blockSpaced}>
            <View style={styles.blockHeadingRow}>
              <View style={styles.sectionHeadingRow}>
                <View style={styles.accentAmber} />
                <Text style={styles.sectionHeading}>Operations Hub</Text>
              </View>
              <TouchableOpacity onPress={() => setMode("edit")}>
                <Text style={styles.linkCta}>Manage All Hubs</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.hubGrid, !isWide && styles.hubGridStack]}>
              {warehouses.length === 0 ? (
                <Text style={styles.emptyMuted}>No registered hubs yet.</Text>
              ) : (
                warehouses.map((wh) => (
                  <View key={wh.id} style={styles.hubCard}>
                    <View style={styles.hubIcon}>
                      <FontAwesome name="archive" size={26} color={Theme.aggregatePillText} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.hubName} numberOfLines={2}>
                        {wh.name}
                      </Text>
                      <Text style={styles.hubAddr} numberOfLines={3}>
                        {wh.address}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {type === "client" && (
          <View style={styles.blockSpaced}>
            <View style={styles.blockHeadingRow}>
              <View style={styles.sectionHeadingRow}>
                <View style={styles.accentNavy} />
                <Text style={styles.sectionHeading}>Active Route Contracts</Text>
              </View>
              <TouchableOpacity onPress={() => setMode("edit")}>
                <Text style={styles.linkCta}>View Rate Cards</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.simpleTable}>
              <View style={styles.simpleTableHead}>
                <Text style={[styles.simpleTh, { flex: 1 }]}>Pickup Node</Text>
                <Text style={[styles.simpleTh, { flex: 1 }]}>Destination</Text>
                <Text style={[styles.simpleTh, styles.simpleThRight, { width: 100 }]}>Contract Price</Text>
              </View>
              {contracts.length === 0 ? (
                <Text style={styles.emptyMutedPadded}>No lane contracts on file.</Text>
              ) : (
                contracts.map((cnt) => (
                  <View key={cnt.id} style={styles.simpleTr}>
                    <Text style={[styles.simpleTdPickup, { flex: 1 }]} numberOfLines={2}>
                      {cnt.pickup}
                    </Text>
                    <Text style={[styles.simpleTdDest, { flex: 1 }]} numberOfLines={2}>
                      {cnt.destination}
                    </Text>
                    <Text style={[styles.simpleTdMoney, { width: 100 }]}>
                      ₹{Math.round(cnt.price).toLocaleString("en-IN")}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {type === "supplier" && (
          <View style={styles.blockSpaced}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.accentEmerald} />
              <Text style={styles.sectionHeading}>Verification Vault</Text>
            </View>
            {kycDocs.length === 0 ? (
              <Text style={styles.emptyMuted}>No KYC documents on file.</Text>
            ) : (
              kycDocs.map((doc) => (
                <View key={doc.id} style={styles.kycVaultCard}>
                  <View style={styles.kycVaultLeft}>
                    <View
                      style={[
                        styles.kycVaultIcon,
                        doc.status === "Verified" ? styles.kycVaultIconOk : styles.kycVaultIconPending,
                      ]}
                    >
                      <FontAwesome
                        name={doc.status === "Verified" ? "clipboard" : "cloud-upload"}
                        size={22}
                        color={doc.status === "Verified" ? Theme.positive : Theme.textMuted}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.kycVaultTitle}>{doc.documentType}</Text>
                      <View style={styles.kycVaultMeta}>
                        <Badge variant={doc.status === "Verified" ? "green" : "orange"}>{doc.status}</Badge>
                        <Text style={styles.kycVaultDate}>Modified: {(doc.dateLabel ?? "").trim() || "—"}</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.kycUpdateBtn}
                    onPress={() => setMode("edit")}
                  >
                    <Text style={styles.kycUpdateBtnText}>Update File</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewRoot: {
    flex: 1,
    backgroundColor: Theme.surface,
  },
  viewStickyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  viewStickyLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  viewStickyTitle: {
    fontSize: 16,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.6,
    flexShrink: 1,
  },
  viewStickyRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  editProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: Theme.textPrimaryDark,
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  editProfileBtnText: {
    color: Theme.textOnPrimary,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  viewScroll: { flex: 1 },
  viewScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    maxWidth: 960,
    width: "100%",
    alignSelf: "center",
  },
  identityCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 36,
    paddingVertical: 28,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    marginBottom: 20,
    overflow: "hidden",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 24 },
        shadowOpacity: 0.06,
        shadowRadius: 40,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  identityBlob: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderBottomLeftRadius: 140,
    backgroundColor: Theme.fiscalTabActiveBg,
    opacity: 0.55,
  },
  avatarRing: {
    padding: 6,
    borderRadius: 100,
    backgroundColor: Theme.cardWhite,
    marginBottom: 12,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: Theme.textOnPrimary,
    fontSize: 28,
    fontWeight: "900",
    fontStyle: "italic",
  },
  identityName: {
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    textAlign: "center",
    letterSpacing: -1,
    lineHeight: 26,
  },
  identityId: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.aggregatePillText,
  },
  identityBadgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 14 },
  pillEmerald: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.positive + "33",
  },
  pillEmeraldText: { fontSize: 10, fontWeight: "900", color: Theme.positive, textTransform: "uppercase" },
  pillIndigo: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.fiscalTabActiveBg,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  pillIndigoMuted: { backgroundColor: Theme.surfaceGray },
  pillIndigoText: { fontSize: 10, fontWeight: "900", color: Theme.aggregatePillText, textTransform: "uppercase" },
  pillIndigoTextMuted: { color: Theme.textMuted },
  completionBlock: { width: "100%", maxWidth: 360, marginTop: 18 },
  completionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 2,
    marginBottom: 6,
  },
  completionLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  completionPct: {
    fontSize: 15,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.primary,
  },
  completionTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Theme.surfaceBorder,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    overflow: "hidden",
  },
  completionFill: { height: "100%", borderRadius: 999 },
  kpiGrid: { flexDirection: "row", gap: 12, marginTop: 22, width: "100%" },
  kpiTile: {
    flex: 1,
    backgroundColor: Theme.surface,
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    alignItems: "center",
  },
  kpiTileLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 8,
    textAlign: "center",
  },
  kpiTileValue: {
    fontSize: 20,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  twoCol: { flexDirection: "row", gap: 16, marginBottom: 8 },
  twoColStack: { flexDirection: "column" },
  colBlock: { flex: 1, minWidth: 0 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, marginBottom: 10 },
  accentIndigo: { width: 4, height: 28, borderRadius: 4, backgroundColor: Theme.primary },
  accentEmerald: { width: 4, height: 28, borderRadius: 4, backgroundColor: Theme.positive },
  accentAmber: { width: 4, height: 28, borderRadius: 4, backgroundColor: Theme.warning },
  accentNavy: { width: 4, height: 28, borderRadius: 4, backgroundColor: Theme.textPrimaryDark },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  registryCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 32,
    padding: 18,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    gap: 14,
  },
  registryRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  registryIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  registryLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  registryValue: { fontSize: 16, fontWeight: "700", color: Theme.textPrimary },
  taxLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  taxGst: { fontSize: 20, fontWeight: "900", color: Theme.textPrimaryDark, textTransform: "uppercase" },
  taxPan: { fontSize: 16, fontWeight: "800", color: Theme.textPrimary },
  taxBilling: { fontSize: 14, fontWeight: "700", fontStyle: "italic", color: Theme.textSecondary, lineHeight: 20 },
  blockSpaced: { marginBottom: 22 },
  blockHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 2,
    gap: 8,
  },
  linkCta: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  hubGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  hubGridStack: { flexDirection: "column" },
  hubCard: {
    flex: 1,
    minWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Theme.cardWhite,
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  hubIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  hubName: { fontSize: 16, fontWeight: "900", fontStyle: "italic", color: Theme.textPrimaryDark },
  hubAddr: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  simpleTable: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    overflow: "hidden",
  },
  simpleTableHead: {
    flexDirection: "row",
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  simpleTh: {
    fontSize: 9,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  simpleThRight: { textAlign: "right" },
  simpleTr: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  simpleTdPickup: {
    fontSize: 13,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimary,
    textTransform: "uppercase",
    paddingRight: 6,
  },
  simpleTdDest: {
    fontSize: 13,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.aggregatePillText,
    paddingRight: 6,
  },
  simpleTdMoney: { fontSize: 14, fontWeight: "900", color: Theme.textPrimaryDark, textAlign: "right" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: -0.2 },
  emptyMuted: { fontSize: 13, color: Theme.textMuted, fontWeight: "600" },
  emptyMutedPadded: { fontSize: 13, color: Theme.textMuted, fontWeight: "600", padding: 16 },
  editorRoot: { flex: 1, backgroundColor: Theme.cardWhite },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    gap: 8,
  },
  editorHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  editorTitle: {
    fontSize: 16,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.6,
  },
  editorSubtitle: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  editorHeaderActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  discardBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Theme.surfaceGray,
  },
  discardBtnText: { fontSize: 11, fontWeight: "900", color: Theme.textMuted, textTransform: "uppercase" },
  syncBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Theme.primary,
  },
  syncBtnText: { fontSize: 11, fontWeight: "900", color: Theme.textOnPrimary, textTransform: "uppercase" },
  editorBody: { flex: 1, flexDirection: "row" },
  editorBodyColumn: { flexDirection: "column" },
  editorAside: { width: 280, borderRightWidth: 1, borderRightColor: Theme.surfaceBorder, backgroundColor: Theme.surface },
  editorAsideContent: { padding: 16, gap: 10 },
  editorTabsRow: { maxHeight: 72, borderBottomWidth: 1, borderBottomColor: Theme.surfaceBorder, backgroundColor: Theme.surface },
  editorTabsRowContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 10, alignItems: "center" },
  editorTab: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: Theme.cardWhite,
  },
  editorTabPill: { marginRight: 8 },
  editorTabFullWidth: { alignSelf: "stretch", width: "100%" },
  editorTabActive: {
    backgroundColor: Theme.textPrimaryDark,
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  editorTabLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  editorTabLabelActive: { color: Theme.textOnPrimary },
  editorTabPulse: {
    position: "absolute",
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.aggregatePillText,
  },
  editorMain: { flex: 1, backgroundColor: Theme.cardWhite },
  editorMainContent: { padding: 20, paddingBottom: 48 },
  editSection: { position: "relative", paddingLeft: 12, marginBottom: 24 },
  editSectionBarIndigo: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 4,
    borderRadius: 4,
    backgroundColor: Theme.primary,
  },
  editSectionBarAmber: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 4,
    borderRadius: 4,
    backgroundColor: Theme.warning,
  },
  editSectionBarNavy: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 4,
    borderRadius: 4,
    backgroundColor: Theme.textPrimaryDark,
  },
  editSectionBarEmerald: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 4,
    borderRadius: 4,
    backgroundColor: Theme.positive,
  },
  editSectionRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  editSectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  editSectionHint: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginLeft: 4,
    marginBottom: 8,
  },
  fieldInputLarge: {
    backgroundColor: Theme.surface,
    borderWidth: 2,
    borderColor: Theme.surface,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    marginBottom: 16,
  },
  fieldInputArea: {
    backgroundColor: Theme.surface,
    borderWidth: 2,
    borderColor: Theme.surface,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textSecondary,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  smallCtaAmber: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: Theme.warningMuted,
  },
  smallCtaAmberText: { fontSize: 11, fontWeight: "900", color: Theme.warning, textTransform: "uppercase" },
  smallCtaNavy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: Theme.textPrimaryDark,
  },
  smallCtaNavyText: { fontSize: 11, fontWeight: "900", color: Theme.textOnPrimary, textTransform: "uppercase" },
  hubEditCard: {
    borderWidth: 2,
    borderColor: Theme.surfaceBorder,
    borderRadius: 32,
    padding: 16,
    backgroundColor: Theme.surface,
    marginBottom: 12,
  },
  hubEditTop: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  hubEditIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  hubEditName: { fontSize: 20, fontWeight: "900", fontStyle: "italic", color: Theme.textPrimaryDark },
  localGstPill: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  localGstPillText: { fontSize: 10, fontWeight: "900", color: Theme.aggregatePillText, textTransform: "uppercase" },
  iconBtnGhost: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  hubEditGrid: { flexDirection: "row", borderTopWidth: 1, borderTopColor: Theme.surfaceBorder, paddingTop: 14, gap: 12 },
  hubEditCol: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  hubEditColRight: { borderLeftWidth: 1, borderLeftColor: Theme.surfaceBorder, paddingLeft: 12 },
  hubEditAddr: { flex: 1, fontSize: 14, fontWeight: "700", fontStyle: "italic", color: Theme.textPrimary },
  hubEditContact: { fontSize: 14, fontWeight: "700", color: Theme.textPrimary },
  hubEditPhone: { marginTop: 4, fontSize: 12, fontWeight: "700", fontStyle: "italic", color: Theme.textMuted },
  contractTableWrap: {
    borderRadius: 36,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  contractTableHead: {
    flexDirection: "row",
    backgroundColor: Theme.textPrimaryDark,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  contractTh: {
    fontSize: 9,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  contractThCenter: { textAlign: "center" },
  contractThRight: { textAlign: "right" },
  contractTr: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  contractTdPickup: {
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    paddingRight: 6,
  },
  contractTdDestWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 6 },
  contractDestRule: { width: 20, height: StyleSheet.hairlineWidth, backgroundColor: Theme.borderMedium },
  contractTdDest: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  contractPricingCol: { alignItems: "center" },
  perPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  perPillTrip: { backgroundColor: Theme.fiscalTabActiveBg, borderColor: Theme.aggregatePillBorder },
  perPillTon: { backgroundColor: Theme.warningMuted, borderColor: Theme.warning + "44" },
  perPillText: { fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  perPillTextTrip: { color: Theme.aggregatePillText },
  perPillTextTon: { color: Theme.warning },
  laborHint: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: "900",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  laneRate: { fontSize: 20, fontWeight: "900", fontStyle: "italic", color: Theme.textPrimaryDark },
  laneNotes: { marginTop: 6, fontSize: 8, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase" },
  kycVaultCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    marginBottom: 12,
  },
  kycVaultLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  kycVaultIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  kycVaultIconOk: { backgroundColor: Theme.positiveMuted },
  kycVaultIconPending: { backgroundColor: Theme.surfaceGray },
  kycVaultTitle: {
    fontSize: 16,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  kycVaultMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  kycVaultDate: { fontSize: 9, fontWeight: "800", color: Theme.textSection, textTransform: "uppercase" },
  kycUpdateBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: Theme.textPrimaryDark,
  },
  kycUpdateBtnText: { fontSize: 10, fontWeight: "900", color: Theme.textOnPrimary, textTransform: "uppercase" },
});
