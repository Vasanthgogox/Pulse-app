/**
 * Details tab — Metronic company profile (Highlights, Open protocols, Company
 * profile, Locations) with inline CRUD aligned to KeenThemes reference.
 */
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { NetworkDesktopHeadquarterMap } from "@/features/network/components/desktop/NetworkDesktopHeadquarterMap";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { NetworkDesktopLocationModal } from "@/features/network/components/desktop/NetworkDesktopLocationModal";
import { NetworkDesktopPeopleStack } from "@/features/network/components/desktop/NetworkDesktopPeopleStack";
import {
  NetworkDesktopWorkspaceProfileModal,
  type WorkspaceProfileEditSection,
} from "@/features/network/components/desktop/NetworkDesktopWorkspaceProfileModal";
import { useOrganizationOfficeMap } from "@/features/network/hooks/useOrganizationOfficeMap";
import { networkHubProfileCompletion } from "@/features/network/utils/networkHubProfileCompletion.util";
import { buildProjectPeopleStack } from "@/features/network/utils/networkProjectPeople.util";
import {
  buildHeadquarterLocationCard,
  formatLocationSubtitle,
  LOCATION_TYPE_GRADIENTS,
  type LocationCardModel,
} from "@/features/network/utils/organizationLocationDisplay.util";
import {
  kycCompletionPct,
  KycFieldsList,
  KycProgressBlock,
} from "@/features/organization/components/workspace/workspacePanelUi";
import { getWorkspaceKyc, updateWorkspaceKyc } from "@/features/organization/services/organization.service";
import type { OrganizationWorkspaceLocation } from "@/features/organization/services/organizationLocations.service";
import type { OrganizationWorkspaceProfile } from "@/features/organization/services/organizationWorkspaceProfile.service";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import {
  useClientsQuery,
  useDriversQuery,
  useSuppliersQuery,
} from "@/lib/queries";
import { useOrganizationLocationsQuery } from "@/lib/queries/useOrganizationLocationsQuery";
import { useOrganizationWorkspaceProfileQuery } from "@/lib/queries/useOrganizationWorkspaceProfileQuery";
import { ROUTES } from "@/lib/routes";
import type { CurrentOrganization, WorkspaceKyc } from "@/types/organization";
import { useRouter } from "expo-router";
import {
  Briefcase,
  Calendar,
  Globe,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Truck,
  User,
  UserPlus,
  Users,
} from "lucide-react-native";
import type { ReactNode } from "react";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

type Props = {
  orgId: string | null;
  organization: CurrentOrganization | null;
  email: string;
  phone?: string | null;
  totalConnections: number;
  clientCount: number;
  supplierCount: number;
  driverCount: number;
  pendingInviteCount: number;
};

function StatusPill({ label }: { label: string }) {
  return (
    <View style={styles.subscribedPill}>
      <Text style={styles.subscribedPillText}>{label}</Text>
    </View>
  );
}

function CardHeader({
  title,
  onEdit,
  editLabel = "Edit",
  action,
  compact,
}: {
  title: string;
  onEdit?: () => void;
  editLabel?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={styles.cardHeaderRow}>
      <Text
        style={[
          styles.cardTitle,
          styles.cardTitleInline,
          compact && mobile.cardTitleCompact,
        ]}
      >
        {title}
      </Text>
      {action}
      {onEdit ? (
        <Pressable
          style={({ pressed }) => [
            styles.cardEditBtn,
            pressed && { opacity: 0.85 },
            Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
          ]}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`${editLabel} ${title}`}
        >
          <Pencil size={compact ? 11 : 12} color={METRONIC.muted} strokeWidth={2.2} />
          <Text style={[styles.cardEditBtnText, compact && { fontSize: 10 }]}>
            {editLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function HighlightRow({
  label,
  value,
  valueNode,
  link,
  last,
  compact,
}: {
  label: string;
  value?: string;
  valueNode?: ReactNode;
  link?: boolean;
  last?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <View style={[mobile.kvRowStacked, last && styles.kvRowLast]}>
        <Text style={mobile.kvLabelStacked}>{label}</Text>
        {valueNode ?? (
          <Text
            style={[mobile.kvValueStacked, link && styles.kvValueLink]}
            numberOfLines={3}
          >
            {value}
          </Text>
        )}
      </View>
    );
  }
  return (
    <View style={[styles.kvRow, last && styles.kvRowLast]}>
      <Text style={styles.kvLabel}>{label}</Text>
      {valueNode ?? (
        <Text style={[styles.kvValue, link && styles.kvValueLink]} numberOfLines={2}>
          {value}
        </Text>
      )}
    </View>
  );
}

function NetworkLinkRow({
  icon: Icon,
  value,
  compact,
}: {
  icon: typeof Globe;
  value: string;
  compact?: boolean;
}) {
  if (!value || value === "—") return null;
  return (
    <View style={styles.networkLinkRow}>
      <Icon size={compact ? 13 : 15} color={METRONIC.muted} strokeWidth={2} />
      <Text
        style={[styles.networkLinkText, compact && mobile.networkLinkTextCompact]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function ActivityItem({
  icon: Icon,
  title,
  meta,
  nested,
  last,
}: {
  icon: typeof User;
  title: string;
  meta: string;
  nested?: ReactNode;
  last?: boolean;
}) {
  return (
    <View style={styles.activityItem}>
      <View style={styles.activityRail}>
        <View style={styles.activityDot}>
          <Icon size={13} color={METRONIC.subtle} strokeWidth={2.2} />
        </View>
        {!last ? <View style={styles.activityLine} /> : null}
      </View>
      <View style={[styles.activityBody, last && styles.activityBodyLast]}>
        <Text style={styles.activityTitle}>{title}</Text>
        <Text style={styles.activityMeta}>{meta}</Text>
        {nested}
      </View>
    </View>
  );
}

function OpenProtocolRow({
  icon: Icon,
  category,
  title,
  meta,
  last,
}: {
  icon: typeof UserPlus;
  category: string;
  title: string;
  meta: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.openJobRow, last && styles.openJobRowLast]}>
      <View style={styles.openJobIcon}>
        <Icon size={16} color={METRONIC.subtle} strokeWidth={2} />
      </View>
      <View style={styles.openJobTextCol}>
        <Text style={styles.openJobCategory}>{category}</Text>
        <Text style={styles.openJobTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.openJobMeta}>{meta}</Text>
      </View>
    </View>
  );
}

const CAPABILITY_TAGS = [
  "Trips",
  "Indents",
  "Ledger",
  "Fleet",
  "Marketplace",
  "Compliance",
  "Chat",
  "Analytics",
] as const;

function defaultAbout(orgName: string, modelLabel: string): string {
  return `${orgName} uses Pulse to manage clients, suppliers, and fleet partners on one network. Connect with verified organisations to share trips, indents, and ledger entries across your ${modelLabel.toLowerCase()} workspace.`;
}

function defaultProducts(
  canPostLoads: boolean,
  canBid: boolean,
  canManageAssets: boolean,
  marketplaceOn: boolean,
): string[] {
  return [
    "Trip management",
    canPostLoads ? "Load posting" : "Load viewing",
    canBid ? "Market bidding" : "Partner matching",
    canManageAssets ? "Asset fleet" : "Partner fleet",
    marketplaceOn ? "Marketplace" : "Private network",
    "Ledger sync",
  ];
}

function profileDerived(
  profile: OrganizationWorkspaceProfile | undefined,
  orgName: string,
  email: string,
  slug: string,
  modelLabel: string,
  canPostLoads: boolean,
  canBid: boolean,
  canManageAssets: boolean,
  marketplaceOn: boolean,
) {
  const foundedYear =
    profile?.founded_year ??
    (profile?.created_at ? new Date(profile.created_at).getFullYear() : new Date().getFullYear());

  return {
    foundedYear: String(foundedYear),
    area: profile?.profile_area?.trim() || profile?.zone?.trim() || "India",
    ceo: profile?.profile_ceo_name?.trim() || email.split("@")[0] || "Owner",
    sector: profile?.profile_sector?.trim() || "Logistics & transport",
    website:
      profile?.profile_website?.trim() ||
      `https://${slug || "workspace"}.pulse`,
    facebook: profile?.profile_facebook?.trim() || "",
    youtube: profile?.profile_youtube?.trim() || "",
    about:
      profile?.profile_about?.trim() ||
      defaultAbout(orgName, modelLabel),
    products:
      (profile?.profile_products?.length ?? 0) > 0
        ? profile!.profile_products
        : defaultProducts(canPostLoads, canBid, canManageAssets, marketplaceOn),
    addressLine: profile?.address_line?.trim() || "",
    city: profile?.city?.trim() || "",
    state: profile?.state?.trim() || "",
  };
}

export function NetworkDesktopDetailsPanel({
  orgId,
  organization,
  email,
  phone,
  totalConnections,
  clientCount,
  supplierCount,
  driverCount,
  pendingInviteCount,
}: Props) {
  const layout = useProfileHubCompactLayout();
  const compact = layout.compact;
  const router = useRouter();
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] =
    useState<OrganizationWorkspaceLocation | null>(null);
  const [locationDraft, setLocationDraft] = useState<
    Partial<{
      name: string;
      location_type: OrganizationWorkspaceLocation["location_type"];
      department: string;
      address_line: string;
      city: string;
      state: string;
      is_verified: boolean;
    }>
  >();
  const [profileEditSection, setProfileEditSection] =
    useState<WorkspaceProfileEditSection | null>(null);

  const { profile: authProfile } = useAuth();
  const isDriver = authProfile?.role === 'driver';
  const [kyc, setKyc] = useState<WorkspaceKyc | null>(null);
  const [kycLoaded, setKycLoaded] = useState(false);
  const [showEmptyHighlights, setShowEmptyHighlights] = useState(false);

  useEffect(() => {
    if (isDriver || !orgId) return;
    getWorkspaceKyc(orgId).then(({ kyc: k }) => {
      setKyc(k);
      setKycLoaded(true);
    });
  }, [isDriver, orgId]);

  const profileQ = useOrganizationWorkspaceProfileQuery(orgId);
  const officeMapQ = useOrganizationOfficeMap(orgId);
  const locationsQ = useOrganizationLocationsQuery(orgId);
  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);

  const orgName = organization?.name?.trim() || "Your workspace";
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const modelLabel =
    organization?.operatingModel?.replace(/_/g, " ") ?? "Logistics workspace";
  const phoneDisplay = phone?.trim() || "Not added";
  const marketplaceOn = organization?.marketplaceEnabled ?? false;
  const canPostLoads = organization?.capabilities?.canPostIndent ?? false;
  const canBid = organization?.capabilities?.canBid ?? false;
  const canManageAssets = organization?.capabilities?.canManageAssets ?? false;

  const activeCapabilityTags = CAPABILITY_TAGS.filter((_, i) => {
    const flags = [
      true,
      canPostLoads,
      true,
      canManageAssets,
      marketplaceOn,
      true,
      true,
      totalConnections > 0,
    ];
    return flags[i];
  });

  const derived = profileDerived(
    profileQ.data,
    orgName,
    email,
    slug,
    modelLabel,
    canPostLoads,
    canBid,
    canManageAssets,
    marketplaceOn,
  );

  const officeAddress = useMemo(() => {
    const parts = [derived.addressLine, derived.city, derived.state].filter(Boolean);
    if (parts.length > 0) return parts.join(", ");
    return officeMapQ.data?.addressLabel ?? "Add your registered office address";
  }, [derived.addressLine, derived.city, derived.state, officeMapQ.data?.addressLabel]);

  const officeCoordinate = officeMapQ.data?.coordinate ?? null;

  const stats = [
    { value: String(totalConnections), label: "Connections" },
    { value: String(clientCount), label: "Clients" },
    { value: String(supplierCount), label: "Suppliers" },
    { value: String(driverCount), label: "Fleet" },
  ];

  const headquarterCard = useMemo(
    () => buildHeadquarterLocationCard(orgName, officeMapQ.data?.rawLocation ?? null),
    [officeMapQ.data?.rawLocation, orgName],
  );

  const locationCards: LocationCardModel[] = useMemo(() => {
    const saved = locationsQ.data ?? [];
    if (saved.length === 0) return [headquarterCard];
    return saved.map((loc) => ({
      id: loc.id,
      name: loc.name,
      locationType: loc.location_type,
      department: loc.department ?? "Operations & dispatch",
      addressLine: loc.address_line?.trim() ?? "",
      city: loc.city,
      state: loc.state,
      verified: loc.is_verified,
      persisted: true,
    }));
  }, [headquarterCard, locationsQ.data]);

  const locationCountLabel = useMemo(() => {
    const locs = locationsQ.data ?? [];
    if (locs.length === 0) return "Add locations";
    const regOff = locs.filter((l) => l.location_type === "registered_office").length;
    const branches = locs.filter((l) => l.location_type === "branch_office").length;
    const hubs = locs.filter((l) => l.location_type === "primary_hub" || l.location_type === "regional_office" || l.location_type === "dispatch_center").length;
    const warehouses = locs.filter((l) => l.location_type === "warehouse").length;
    const parts: string[] = [];
    if (regOff > 0) parts.push(`${regOff} Reg. office`);
    if (branches > 0) parts.push(`${branches} Branch${branches > 1 ? "es" : ""}`);
    if (hubs > 0) parts.push(`${hubs} Hub${hubs > 1 ? "s" : ""}`);
    if (warehouses > 0) parts.push(`${warehouses} WH`);
    return parts.length > 0 ? parts.join(" · ") : `${locs.length} location${locs.length > 1 ? "s" : ""}`;
  }, [locationsQ.data]);

  const openAddLocation = (type: OrganizationWorkspaceLocation["location_type"] = "registered_office") => {
    setEditingLocation(null);
    const labelMap: Record<string, string> = {
      registered_office: "Registered office",
      branch_office: "Branch office",
      primary_hub: "Hub",
      regional_office: "Regional office",
      dispatch_center: "Dispatch center",
      warehouse: "Warehouse",
      other: "Location",
    };
    setLocationDraft({
      name: `${orgName} ${labelMap[type] ?? "Location"}`,
      location_type: type,
      department: type === "registered_office" ? "Legal & compliance" : "Operations & dispatch",
      address_line: derived.addressLine || officeMapQ.data?.addressLabel,
      city: derived.city || officeMapQ.data?.rawLocation?.city || undefined,
      state: derived.state || officeMapQ.data?.rawLocation?.state || undefined,
      is_verified: false,
    });
    setLocationModalOpen(true);
  };

  const activeDrivers = useMemo(
    () => (driversQ.data ?? []).filter((d) => !d.left_at),
    [driversQ.data],
  );

  const projectRows = useMemo(() => {
    const clients = clientsQ.data ?? [];
    const suppliers = suppliersQ.data ?? [];
    const clientPeople = buildProjectPeopleStack(clients, "client");
    const supplierPeople = buildProjectPeopleStack(suppliers, "supplier");
    const driverPeople = buildProjectPeopleStack(activeDrivers, "driver");

    return [
      {
        name: "Client network expansion",
        progress: Math.min(
          100,
          Math.round((clientCount / Math.max(totalConnections, 1)) * 100),
        ),
        people: clientPeople,
        due: "Active",
      },
      {
        name: "Supplier integration pipeline",
        progress: Math.min(
          100,
          Math.round((supplierCount / Math.max(totalConnections, 1)) * 100),
        ),
        people: supplierPeople,
        due: "Ongoing",
      },
      {
        name: "Fleet onboarding",
        progress: Math.min(
          100,
          Math.round((driverCount / Math.max(totalConnections, 1)) * 100),
        ),
        people: driverPeople,
        due: "Live",
      },
    ];
  }, [
    activeDrivers,
    clientCount,
    clientsQ.data,
    driverCount,
    supplierCount,
    suppliersQ.data,
    totalConnections,
  ]);

  const openLocationDetail = (card: LocationCardModel) => {
    if (card.persisted) {
      const row = (locationsQ.data ?? []).find((l) => l.id === card.id);
      if (!row) return;
      setEditingLocation(row);
      setLocationDraft(undefined);
      setLocationModalOpen(true);
      return;
    }
    setEditingLocation(null);
    setLocationDraft({
      name: card.name,
      location_type: card.locationType,
      department: card.department,
      address_line: card.addressLine || officeAddress,
      city: card.city ?? undefined,
      state: card.state ?? undefined,
      is_verified: card.verified,
    });
    setLocationModalOpen(true);
  };

  if (!orgId) {
    return (
      <View style={[styles.detailsBody, compact && mobile.detailsBodyCompact]}>
        <ActivityIndicator color={METRONIC.muted} />
      </View>
    );
  }

  const rowProps = { compact };

  return (
    <View style={[styles.detailsBody, compact && mobile.detailsBodyCompact]}>
      {!compact ? (
        <View style={styles.statsBar}>
          {stats.map((stat, idx, arr) => (
            <View
              key={stat.label}
              style={[styles.statCell, idx === arr.length - 1 && styles.statCellLast]}
            >
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.splitRow, compact && mobile.splitColumn]}>
        <View style={[styles.sidebar, compact && mobile.sidebarFull]}>
          <View style={[styles.card, compact && mobile.cardCompact]}>
            <CardHeader
              title="Overview"
              onEdit={() => setProfileEditSection("highlights")}
              compact={compact}
            />
            {(() => {
              const p = profileQ.data;
              const hasLocations = locationCountLabel !== 'Add locations';
              const hasYear = p?.founded_year != null;
              const hasArea = !!(p?.profile_area?.trim() || p?.zone?.trim());
              const hasCeo = !!p?.profile_ceo_name?.trim();
              const hasSector = !!p?.profile_sector?.trim();
              const hasAbout = !!p?.profile_about?.trim();
              const hasProducts = (p?.profile_products?.length ?? 0) > 0;

              type RowDef = { key: string; label: string; value?: string; link?: boolean; valueNode?: React.ReactNode };
              type EmptyDef = { key: string; label: string; onFill: () => void };
              const filledRows: RowDef[] = [];
              const emptyFields: EmptyDef[] = [];

              filledRows.push({ key: 'status', label: 'Status', valueNode: <StatusPill label="Subscribed" /> });

              if (organization?.operatingModel) {
                filledRows.push({ key: 'model', label: 'Model', value: modelLabel });
              }

              if (hasYear) filledRows.push({ key: 'yr', label: 'Founded', value: derived.foundedYear });
              else emptyFields.push({ key: 'yr', label: 'Founded', onFill: () => setProfileEditSection('highlights') });

              if (hasArea) filledRows.push({ key: 'area', label: 'Area', value: derived.area });
              else emptyFields.push({ key: 'area', label: 'Area', onFill: () => setProfileEditSection('highlights') });

              if (hasCeo) filledRows.push({ key: 'ceo', label: 'CEO', value: derived.ceo, link: true });
              else emptyFields.push({ key: 'ceo', label: 'CEO / Owner', onFill: () => setProfileEditSection('highlights') });

              if (hasSector) filledRows.push({ key: 'sec', label: 'Sector', value: derived.sector });
              else emptyFields.push({ key: 'sec', label: 'Sector', onFill: () => setProfileEditSection('highlights') });

              if (hasLocations) filledRows.push({ key: 'loc', label: 'Locations', value: locationCountLabel });
              else emptyFields.push({ key: 'loc', label: 'Locations', onFill: () => openAddLocation() });

              if (!hasAbout) emptyFields.push({ key: 'about', label: 'About', onFill: () => setProfileEditSection('about') });
              if (!hasProducts) emptyFields.push({ key: 'prod', label: 'Products', onFill: () => setProfileEditSection('products') });

              const noEmpty = emptyFields.length === 0;
              return (
                <>
                  {filledRows.map((row, i) => (
                    <HighlightRow
                      key={row.key}
                      label={row.label}
                      value={row.value}
                      valueNode={row.valueNode}
                      link={row.link}
                      last={noEmpty && i === filledRows.length - 1}
                      {...rowProps}
                    />
                  ))}
                  {emptyFields.length > 0 ? (
                    <>
                      {showEmptyHighlights ? (
                        emptyFields.map((f) => (
                          <Pressable key={f.key} onPress={f.onFill} style={overviewStyles.emptyRow} hitSlop={4}>
                            <Text style={overviewStyles.emptyLabel}>{f.label}</Text>
                            <Text style={overviewStyles.emptyAction}>+ Add →</Text>
                          </Pressable>
                        ))
                      ) : null}
                      <Pressable
                        onPress={() => setShowEmptyHighlights((v) => !v)}
                        style={overviewStyles.toggleRow}
                        hitSlop={6}
                      >
                        <Text style={overviewStyles.toggleText}>
                          {showEmptyHighlights
                            ? `▲ Hide`
                            : `+ ${emptyFields.length} field${emptyFields.length > 1 ? 's' : ''} not filled`}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </>
              );
            })()}
          </View>

          <View style={[styles.card, compact && mobile.cardCompact]}>
            <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>
              Open protocols
            </Text>
            <OpenProtocolRow
              icon={UserPlus}
              category="Client"
              title="Add verified shippers"
              meta={`${clientCount} connected · ${pendingInviteCount} pending`}
            />
            <OpenProtocolRow
              icon={Truck}
              category="Supplier"
              title="Expand carrier network"
              meta={`${supplierCount} partners onboarded`}
            />
            <OpenProtocolRow
              icon={Users}
              category="Fleet"
              title="Driver roster growth"
              meta={`${driverCount} active drivers`}
              last
            />
            <Pressable style={styles.cardFooterLink}>
              <Text style={styles.cardFooterLinkText}>View & apply</Text>
            </Pressable>
          </View>

          <View style={[styles.card, compact && mobile.cardCompact]}>
            <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>Tags</Text>
            <View style={styles.tagWrap}>
              {activeCapabilityTags.map((tag) => (
                <View key={tag} style={styles.tagPill}>
                  <Text style={[styles.tagPillText, compact && mobile.tagPillTextCompact]}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {!isDriver && kycLoaded ? (
            <View style={[styles.card, compact && mobile.cardCompact, { padding: 0, gap: 0, overflow: 'hidden' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={14} color={kyc?.verification_status === 'verified' ? '#50CD89' : METRONIC.subtle} strokeWidth={2} />
                  <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact, { marginBottom: 0 }]}>Identity & Compliance</Text>
                </View>
                {kyc?.verification_status ? (
                  <View style={{
                    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
                    backgroundColor: kyc.verification_status === 'verified' ? '#E8FFF3' : kyc.verification_status === 'pending' ? '#FFF8DD' : '#F1F1F4',
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: kyc.verification_status === 'verified' ? '#50CD89' : kyc.verification_status === 'pending' ? '#F6C000' : METRONIC.subtle }}>
                      {kyc.verification_status.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
              </View>
              {(() => {
                const kycPct = kycCompletionPct(kyc);
                const barColor = kycPct === 100 ? '#50CD89' : kycPct > 0 ? '#F6C000' : '#F64E60';
                return <KycProgressBlock pct={kycPct} barColor={barColor} />;
              })()}
              <KycFieldsList
                kyc={kyc}
                canEdit
                onSave={async (f, val) => {
                  if (!orgId) return;
                  const { kyc: updated } = await updateWorkspaceKyc(orgId, { [f]: val || null });
                  if (updated) setKyc(updated);
                }}
              />
            </View>
          ) : null}
        </View>

        <View style={[styles.mainCol, compact && mobile.mainColFull]}>
          <View style={[styles.card, compact && mobile.cardCompact]}>
            <CardHeader
              title="Company profile"
              onEdit={() => setProfileEditSection("contact")}
              compact={compact}
            />

            {(() => {
              const { pct, gaps } = networkHubProfileCompletion({
                profile: profileQ.data,
                locationCount: locationsQ.data?.length ?? 0,
                kyc,
              });
              if (pct === 100) return null;
              const barColor = pct > 33 ? '#F6C000' : '#F64E60';
              const openGap = (gap: (typeof gaps)[number]) => {
                if (gap.section === 'kyc') {
                  router.push({
                    pathname: ROUTES.WORKSPACE,
                    params: { panel: 'kyc' },
                  });
                  return;
                }
                if (gap.section === 'locations') {
                  openAddLocation();
                  return;
                }
                setProfileEditSection(gap.section);
              };
              return (
                <View style={profileCompletionStyles.banner}>
                  <View style={profileCompletionStyles.topRow}>
                    <Text style={profileCompletionStyles.label}>
                      Profile {pct}% complete
                    </Text>
                  </View>
                  <View style={profileCompletionStyles.track}>
                    <View style={[profileCompletionStyles.fill, { width: `${pct}%` as `${number}%`, backgroundColor: barColor }]} />
                  </View>
                  <View style={profileCompletionStyles.actionRow}>
                    {gaps.slice(0, 4).map((gap) => (
                      <Pressable
                        key={gap.key}
                        onPress={() => openGap(gap)}
                        style={profileCompletionStyles.actionChip}
                        hitSlop={6}
                      >
                        <Text style={profileCompletionStyles.actionChipText}>
                          + Add {gap.label.toLowerCase()}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })()}

            <Text style={[styles.sectionHeading, compact && mobile.sectionHeadingCompact]}>
              Headquarter
            </Text>
            <View style={[styles.headquarterRow, compact && mobile.headquarterStack]}>
              <View style={[{ flex: 1, minWidth: 0 }, compact && mobile.mapFrameFull]}>
                <NetworkDesktopHeadquarterMap
                  orgName={orgName}
                  addressLabel={officeAddress}
                  coordinate={officeCoordinate}
                  loading={officeMapQ.isLoading || profileQ.isLoading}
                />
              </View>
              <View style={[styles.contactList, compact && mobile.contactListFull]}>
                <NetworkLinkRow
                  icon={Globe}
                  value={profileQ.data?.profile_website?.trim() || "Add website"}
                  compact={compact}
                />
                {derived.facebook ? (
                  <NetworkLinkRow icon={Globe} value={derived.facebook} compact={compact} />
                ) : null}
                {derived.youtube ? (
                  <NetworkLinkRow icon={Globe} value={derived.youtube} compact={compact} />
                ) : null}
                <NetworkLinkRow icon={Mail} value={email} compact={compact} />
                <NetworkLinkRow icon={Phone} value={phoneDisplay} compact={compact} />
                <NetworkLinkRow icon={MapPin} value={officeAddress} compact={compact} />
              </View>
            </View>

            <View style={styles.cardHeaderRow}>
              <Text
                style={[
                  styles.sectionHeading,
                  styles.sectionHeadingSpaced,
                  compact && mobile.sectionHeadingCompact,
                  compact && mobile.sectionHeadingSpacedCompact,
                ]}
              >
                About
              </Text>
              <Pressable
                style={styles.cardEditBtn}
                onPress={() => setProfileEditSection("about")}
              >
                <Pencil size={compact ? 11 : 12} color={METRONIC.muted} strokeWidth={2.2} />
                <Text style={[styles.cardEditBtnText, compact && { fontSize: 10 }]}>Edit</Text>
              </Pressable>
            </View>
            {profileQ.data?.profile_about?.trim() ? (
              <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
                {profileQ.data.profile_about.trim()}
              </Text>
            ) : (
              <Pressable onPress={() => setProfileEditSection("about")} style={emptyStateStyles.row}>
                <Text style={emptyStateStyles.text}>No about text — tap to add a description</Text>
              </Pressable>
            )}

            <View style={styles.cardHeaderRow}>
              <Text
                style={[
                  styles.sectionHeading,
                  styles.sectionHeadingSpaced,
                  compact && mobile.sectionHeadingCompact,
                  compact && mobile.sectionHeadingSpacedCompact,
                ]}
              >
                Products
              </Text>
              <Pressable
                style={styles.cardEditBtn}
                onPress={() => setProfileEditSection("products")}
              >
                <Pencil size={compact ? 11 : 12} color={METRONIC.muted} strokeWidth={2.2} />
                <Text style={[styles.cardEditBtnText, compact && { fontSize: 10 }]}>Edit</Text>
              </Pressable>
            </View>
            {(profileQ.data?.profile_products?.length ?? 0) > 0 ? (
              <View style={styles.tagWrap}>
                {(profileQ.data?.profile_products ?? []).map((product) => (
                  <View key={product} style={styles.productPill}>
                    <Text style={[styles.productPillText, compact && mobile.tagPillTextCompact]}>
                      {product}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Pressable onPress={() => setProfileEditSection("products")} style={emptyStateStyles.row}>
                <Text style={emptyStateStyles.text}>No products listed — tap to add</Text>
              </Pressable>
            )}
          </View>

          <View style={[styles.card, compact && mobile.cardCompact]}>
            <CardHeader
              title="Locations & offices"
              compact={compact}
              action={
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Pressable
                    style={[styles.offerLocationBtn, { backgroundColor: METRONIC.text }]}
                    onPress={() => openAddLocation("registered_office")}
                    accessibilityRole="button"
                    accessibilityLabel="Add registered office"
                  >
                    <Plus size={12} color="#fff" strokeWidth={2.6} />
                    <Text style={[styles.offerLocationBtnText]}>Reg. Office</Text>
                  </Pressable>
                  <Pressable
                    style={styles.offerLocationBtn}
                    onPress={() => openAddLocation("branch_office")}
                    accessibilityRole="button"
                    accessibilityLabel="Add branch"
                  >
                    <Plus size={12} color={Theme.textOnPrimary} strokeWidth={2.6} />
                    <Text style={styles.offerLocationBtnText}>Branch</Text>
                  </Pressable>
                </View>
              }
            />
            {locationsQ.isLoading ? (
              <View style={styles.locationsEmpty}>
                <ActivityIndicator color={METRONIC.muted} />
              </View>
            ) : locationCards.length === 0 ? (
              <View style={styles.locationsEmpty}>
                <Text style={styles.locationsEmptyText}>
                  No locations yet. Add your registered office or branch.
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <Pressable style={[styles.offerLocationBtn, { backgroundColor: METRONIC.text }]} onPress={() => openAddLocation("registered_office")}>
                    <Plus size={12} color="#fff" strokeWidth={2.6} />
                    <Text style={styles.offerLocationBtnText}>Registered office</Text>
                  </Pressable>
                  <Pressable style={styles.offerLocationBtn} onPress={() => openAddLocation("branch_office")}>
                    <Plus size={12} color={Theme.textOnPrimary} strokeWidth={2.6} />
                    <Text style={styles.offerLocationBtnText}>Branch office</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={[styles.locationsGrid, compact && mobile.locationsGridCompact]}>
                {locationCards.map((card, i) => {
                  const gradient = LOCATION_TYPE_GRADIENTS[card.locationType];
                  const { line1, line2 } = formatLocationSubtitle(
                    i + 1,
                    card.department,
                    card.city,
                    card.state,
                    card.verified,
                    card.locationType,
                  );
                  return (
                    <Pressable
                      key={card.id}
                      style={({ pressed }) => [
                        styles.locationCard,
                        styles.locationCardPressable,
                        compact && mobile.locationCardCompact,
                        Platform.OS === "web"
                          ? ({ cursor: "pointer" } as ViewStyle)
                          : null,
                        pressed && { opacity: 0.92 },
                      ]}
                      onPress={() => openLocationDetail(card)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${card.name}`}
                    >
                      <View
                        style={[styles.locationImage, { backgroundColor: gradient.bg }]}
                      >
                        <Briefcase size={28} color={gradient.accent} strokeWidth={1.8} />
                      </View>
                      <Text style={styles.locationTitle} numberOfLines={2}>
                        {card.name}
                      </Text>
                      <Text style={styles.locationAddress} numberOfLines={1}>
                        {line1}
                      </Text>
                      <Text style={styles.locationAddress} numberOfLines={1}>
                        {line2}
                      </Text>
                      {!card.persisted ? (
                        <Text style={styles.locationLinkHint}>Tap to save details</Text>
                      ) : (
                        <Text style={styles.locationLinkHint}>Tap to edit</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={[styles.card, compact && mobile.cardCompact]}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>
                Network growth
              </Text>
              <Pressable hitSlop={8}>
                <MoreHorizontal size={compact ? 14 : 16} color={METRONIC.muted} />
              </Pressable>
            </View>
            {compact ? (
              <View style={{ gap: 8 }}>
                {projectRows.map((row) => (
                  <View key={row.name} style={{ gap: 4, paddingVertical: 6 }}>
                    <Text
                      style={[styles.projectsCell, compact && { fontSize: 12 }]}
                      numberOfLines={1}
                    >
                      {row.name}
                    </Text>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${row.progress}%` }]} />
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <NetworkDesktopPeopleStack
                        faces={row.people.faces}
                        overflow={row.people.overflow}
                        total={row.people.total}
                      />
                      <Text style={[styles.projectsCellMuted, { fontSize: 10 }]}>
                        {row.due}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <>
            <View style={styles.projectsTableHead}>
              <Text style={[styles.projectsHeadCell, styles.projectsColName]}>
                Project name
              </Text>
              <Text style={[styles.projectsHeadCell, styles.projectsColProgress]}>
                Progress
              </Text>
              <Text style={[styles.projectsHeadCell, styles.projectsColPeople]}>
                People
              </Text>
              <Text style={[styles.projectsHeadCell, styles.projectsColDue]}>Due date</Text>
              <View style={styles.projectsColMenu} />
            </View>
            {projectRows.map((row, idx) => (
              <View
                key={row.name}
                style={[
                  styles.projectsRow,
                  idx === projectRows.length - 1 && styles.projectsRowLast,
                ]}
              >
                <Text style={[styles.projectsCell, styles.projectsColName]} numberOfLines={1}>
                  {row.name}
                </Text>
                <View style={[styles.projectsColProgress, styles.progressTrackWrap]}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${row.progress}%` }]} />
                  </View>
                </View>
                <View style={styles.projectsColPeople}>
                  <NetworkDesktopPeopleStack
                    faces={row.people.faces}
                    overflow={row.people.overflow}
                    total={row.people.total}
                  />
                </View>
                <Text style={[styles.projectsCellMuted, styles.projectsColDue]}>
                  {row.due}
                </Text>
                <View style={styles.projectsColMenu}>
                  <MoreHorizontal size={14} color={METRONIC.muted} />
                </View>
              </View>
            ))}
              </>
            )}
          </View>
        </View>
      </View>

      <View style={[styles.activityCard, layout.activityCard]}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, compact && mobile.cardTitleCompact]}>
            Recent activity
          </Text>
          <View style={styles.autoRefreshPill}>
            <Text style={styles.autoRefreshText}>Auto refresh: Off</Text>
          </View>
        </View>

        <View style={styles.activityList}>
          <ActivityItem
            icon={User}
            title={`${totalConnections} active parties in your workspace`}
            meta="Workspace summary · Today"
          />
          {pendingInviteCount > 0 ? (
            <ActivityItem
              icon={Mail}
              title={`${pendingInviteCount} pending invitation${pendingInviteCount === 1 ? "" : "s"} awaiting review`}
              meta="Inbound protocol"
              nested={
                <View style={styles.activityNestedCard}>
                  <Text style={styles.activityNestedTitle}>
                    Review connection requests
                  </Text>
                  <Text style={styles.activityNestedBody}>
                    Open Invites to approve or decline incoming client and supplier
                    requests before they expire.
                  </Text>
                </View>
              }
            />
          ) : null}
          <ActivityItem
            icon={Users}
            title={`${clientCount} clients · ${supplierCount} suppliers · ${driverCount} fleet partners`}
            meta="Network breakdown"
          />
          {marketplaceOn ? (
            <ActivityItem
              icon={Globe}
              title="Marketplace is enabled — discover and bid on open loads"
              meta="Marketplace"
            />
          ) : null}
          <ActivityItem
            icon={Calendar}
            title={
              totalConnections > 0
                ? "Connections are live — open profiles to view trip history and ledger"
                : "Start by adding contacts or discovering organisations on Pulse"
            }
            meta="Network growth"
            last
          />
        </View>
      </View>

      <NetworkDesktopLocationModal
        visible={locationModalOpen}
        orgId={orgId}
        orgName={orgName}
        location={editingLocation}
        initialDraft={locationDraft}
        onClose={() => {
          setLocationModalOpen(false);
          setEditingLocation(null);
          setLocationDraft(undefined);
        }}
      />

      {profileEditSection ? (
        profileQ.data ? (
          <NetworkDesktopWorkspaceProfileModal
            visible
            orgId={orgId}
            section={profileEditSection}
            profile={profileQ.data}
            email={email}
            phone={phone}
            onClose={() => setProfileEditSection(null)}
          />
        ) : profileQ.isError ? (
          <NetworkDesktopWorkspaceProfileModal
            visible
            orgId={orgId}
            section={profileEditSection}
            profile={{
              id: orgId,
              name: orgName,
              address_line: derived.addressLine || null,
              locality: null,
              pincode: null,
              city: derived.city || null,
              state: derived.state || null,
              zone: null,
              created_at: new Date().toISOString(),
              profile_about: derived.about,
              profile_website: derived.website,
              profile_ceo_name: derived.ceo,
              profile_sector: derived.sector,
              profile_area: derived.area,
              founded_year: parseInt(derived.foundedYear, 10) || null,
              profile_facebook: derived.facebook || null,
              profile_youtube: derived.youtube || null,
              profile_products: derived.products,
            }}
            email={email}
            phone={phone}
            onClose={() => setProfileEditSection(null)}
          />
        ) : null
      ) : null}
    </View>
  );
}

const emptyStateStyles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text: {
    fontSize: 12,
    color: METRONIC.muted,
    fontStyle: 'italic',
  },
});

const overviewStyles = StyleSheet.create({
  toggleRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: METRONIC.border,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: METRONIC.link,
    letterSpacing: 0.1,
  },
  emptyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: METRONIC.border,
    backgroundColor: '#FAFBFC',
  },
  emptyLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: METRONIC.muted,
  },
  emptyAction: {
    fontSize: 10,
    fontWeight: '600',
    color: METRONIC.link,
  },
});

const profileCompletionStyles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#FFFBF0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F6C00033',
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B07D00',
    letterSpacing: 0.2,
  },
  hint: {
    fontSize: 10,
    color: METRONIC.muted,
    fontWeight: '500',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#EFF2F5',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  actionChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFF3CD',
    borderWidth: 1,
    borderColor: '#F6C00066',
  },
  actionChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B07D00',
    letterSpacing: 0.2,
  },
});
