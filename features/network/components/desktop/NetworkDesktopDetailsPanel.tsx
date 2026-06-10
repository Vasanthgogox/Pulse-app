/**
 * Details tab — Metronic company profile (Highlights, Open protocols, Company
 * profile, Locations) with inline CRUD aligned to KeenThemes reference.
 */
import Theme from "@/constants/Theme";
import type { CurrentOrganization } from "@/types/organization";
import { NetworkDesktopHeadquarterMap } from "@/features/network/components/desktop/NetworkDesktopHeadquarterMap";
import { NetworkDesktopLocationModal } from "@/features/network/components/desktop/NetworkDesktopLocationModal";
import { NetworkDesktopPeopleStack } from "@/features/network/components/desktop/NetworkDesktopPeopleStack";
import { buildProjectPeopleStack } from "@/features/network/utils/networkProjectPeople.util";
import {
  NetworkDesktopWorkspaceProfileModal,
  type WorkspaceProfileEditSection,
} from "@/features/network/components/desktop/NetworkDesktopWorkspaceProfileModal";
import { useOrganizationOfficeMap } from "@/features/network/hooks/useOrganizationOfficeMap";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import {
  buildHeadquarterLocationCard,
  formatLocationSubtitle,
  LOCATION_TYPE_GRADIENTS,
  type LocationCardModel,
} from "@/features/network/utils/organizationLocationDisplay.util";
import type { OrganizationWorkspaceLocation } from "@/features/organization/services/organizationLocations.service";
import type { OrganizationWorkspaceProfile } from "@/features/organization/services/organizationWorkspaceProfile.service";
import {
  useClientsQuery,
  useDriversQuery,
  useSuppliersQuery,
} from "@/lib/queries";
import { useOrganizationLocationsQuery } from "@/lib/queries/useOrganizationLocationsQuery";
import { useOrganizationWorkspaceProfileQuery } from "@/lib/queries/useOrganizationWorkspaceProfileQuery";
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
  Truck,
  User,
  UserPlus,
  Users,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
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
              title="Highlights"
              onEdit={() => setProfileEditSection("highlights")}
              compact={compact}
            />
            <HighlightRow label="Locations" value={locationCountLabel} {...rowProps} />
            <HighlightRow label="Founded" value={derived.foundedYear} {...rowProps} />
            <HighlightRow
              label="Status"
              valueNode={<StatusPill label="Subscribed" />}
              {...rowProps}
            />
            <HighlightRow label="Area" value={derived.area} {...rowProps} />
            <HighlightRow label="CEO" value={derived.ceo} link {...rowProps} />
            <HighlightRow label="Sector" value={derived.sector} last {...rowProps} />
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
            <CardHeader
              title="Network"
              onEdit={() => setProfileEditSection("contact")}
              compact={compact}
            />
            <NetworkLinkRow icon={Globe} value={derived.website} compact={compact} />
            <NetworkLinkRow icon={Mail} value={email} compact={compact} />
            <NetworkLinkRow icon={Phone} value={phoneDisplay} compact={compact} />
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
        </View>

        <View style={[styles.mainCol, compact && mobile.mainColFull]}>
          <View style={[styles.card, compact && mobile.cardCompact]}>
            <CardHeader
              title="Company profile"
              onEdit={() => setProfileEditSection("contact")}
              compact={compact}
            />

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
                <NetworkLinkRow icon={Globe} value={derived.website} compact={compact} />
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
            <Text style={[styles.aboutBody, compact && mobile.aboutBodyCompact]}>
              {derived.about}
            </Text>

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
            <View style={styles.tagWrap}>
              {derived.products.map((product) => (
                <View key={product} style={styles.productPill}>
                  <Text style={[styles.productPillText, compact && mobile.tagPillTextCompact]}>
                    {product}
                  </Text>
                </View>
              ))}
            </View>
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
                Projects
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
