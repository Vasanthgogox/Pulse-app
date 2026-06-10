/**
 * Details tab — Metronic company profile (Highlights, Open protocols, Company
 * profile, Locations, Projects) aligned with KeenThemes reference.
 */
import Theme from "@/constants/Theme";
import type { CurrentOrganization } from "@/types/organization";
import { NetworkDesktopHeadquarterMap } from "@/features/network/components/desktop/NetworkDesktopHeadquarterMap";
import { NetworkDesktopPeopleStack } from "@/features/network/components/desktop/NetworkDesktopPeopleStack";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import { NetworkDesktopLocationModal } from "@/features/network/components/desktop/NetworkDesktopLocationModal";
import { useOrganizationOfficeMap } from "@/features/network/hooks/useOrganizationOfficeMap";
import { buildProjectPeopleStack } from "@/features/network/utils/networkProjectPeople.util";
import {
  buildHeadquarterLocationCard,
  formatLocationSubtitle,
  LOCATION_TYPE_GRADIENTS,
  type LocationCardModel,
} from "@/features/network/utils/organizationLocationDisplay.util";
import type { OrganizationWorkspaceLocation } from "@/features/organization/services/organizationLocations.service";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useOrganizationLocationsQuery } from "@/lib/queries/useOrganizationLocationsQuery";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import {
  Briefcase,
  Calendar,
  Globe,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Truck,
  User,
  UserPlus,
  Users,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View, type ViewStyle } from "react-native";

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

function HighlightRow({
  label,
  value,
  valueNode,
  link,
  last,
}: {
  label: string;
  value?: string;
  valueNode?: ReactNode;
  link?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.kvRow, last && styles.kvRowLast]}>
      <Text style={styles.kvLabel}>{label}</Text>
      {valueNode ?? (
        <Text style={[styles.kvValue, link && styles.kvValueLink]} numberOfLines={1}>
          {value}
        </Text>
      )}
    </View>
  );
}

function NetworkLinkRow({
  icon: Icon,
  value,
}: {
  icon: typeof Globe;
  value: string;
}) {
  return (
    <View style={styles.networkLinkRow}>
      <Icon size={15} color={METRONIC.muted} strokeWidth={2} />
      <Text style={styles.networkLinkText} numberOfLines={1}>
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

const PRODUCT_TAGS = [
  "Trips",
  "Indents",
  "Ledger",
  "Fleet",
  "Marketplace",
  "Compliance",
  "Chat",
  "Analytics",
] as const;

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

  const officeMapQ = useOrganizationOfficeMap(orgId);
  const locationsQ = useOrganizationLocationsQuery(orgId);
  const clientsQ = useClientsQuery(orgId);
  const suppliersQ = useSuppliersQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const officeAddress =
    officeMapQ.data?.addressLabel ?? "Registered business address on file";
  const officeCoordinate = officeMapQ.data?.coordinate ?? null;

  const orgName = organization?.name?.trim() || "Your workspace";
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const modelLabel =
    organization?.operatingModel?.replace(/_/g, " ") ?? "Logistics workspace";
  const phoneDisplay = phone?.trim() || "Not added";
  const marketplaceOn = organization?.marketplaceEnabled ?? false;
  const canPostLoads = organization?.capabilities?.canPostIndent ?? false;
  const canBid = organization?.capabilities?.canBid ?? false;
  const canManageAssets = organization?.capabilities?.canManageAssets ?? false;

  const activeTags = PRODUCT_TAGS.filter((_, i) => {
    const flags = [true, canPostLoads, true, canManageAssets, marketplaceOn, true, true, totalConnections > 0];
    return flags[i];
  });

  const stats = [
    { value: String(totalConnections), label: "Connections" },
    { value: String(clientCount), label: "Clients" },
    { value: String(supplierCount), label: "Suppliers" },
    { value: String(driverCount), label: "Fleet" },
  ];

  const activeDrivers = useMemo(
    () => (driversQ.data ?? []).filter((d) => !d.left_at),
    [driversQ.data],
  );

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
    const n = locationsQ.data?.length ?? 0;
    if (n === 0) return "1 hub";
    return `${n} hub${n === 1 ? "" : "s"}`;
  }, [locationsQ.data?.length]);

  const openAddLocation = () => {
    setEditingLocation(null);
    setLocationDraft({
      name: `${orgName} hub`,
      location_type: "primary_hub",
      department: "Operations & dispatch",
      address_line:
        officeMapQ.data?.rawLocation?.address_line ??
        officeMapQ.data?.addressLabel,
      city: officeMapQ.data?.rawLocation?.city ?? undefined,
      state: officeMapQ.data?.rawLocation?.state ?? undefined,
      is_verified: false,
    });
    setLocationModalOpen(true);
  };

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
      address_line: card.addressLine || officeMapQ.data?.addressLabel,
      city: card.city ?? undefined,
      state: card.state ?? undefined,
      is_verified: card.verified,
    });
    setLocationModalOpen(true);
  };

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

  return (
    <View style={styles.detailsBody}>
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

      <View style={styles.splitRow}>
        <View style={styles.sidebar}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Highlights</Text>
            <HighlightRow label="Locations" value={locationCountLabel} />
            <HighlightRow label="Founded" value="2024" />
            <HighlightRow label="Status" valueNode={<StatusPill label="Subscribed" />} />
            <HighlightRow label="Area" value="India" />
            <HighlightRow label="CEO" value={email.split("@")[0] || "Owner"} link />
            <HighlightRow label="Sector" value="Logistics & transport" last />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Open protocols</Text>
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

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Network</Text>
            <NetworkLinkRow
              icon={Globe}
              value={`https://${slug || "workspace"}.pulse`}
            />
            <NetworkLinkRow icon={Mail} value={email} />
            <NetworkLinkRow icon={Phone} value={phoneDisplay} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tags</Text>
            <View style={styles.tagWrap}>
              {activeTags.map((tag) => (
                <View key={tag} style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.mainCol}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Company profile</Text>

            <Text style={styles.sectionHeading}>Headquarter</Text>
            <View style={styles.headquarterRow}>
              <NetworkDesktopHeadquarterMap
                orgName={orgName}
                addressLabel={officeAddress}
                coordinate={officeCoordinate}
                loading={officeMapQ.isLoading}
              />
              <View style={styles.contactList}>
                <NetworkLinkRow
                  icon={Globe}
                  value={`https://${slug || "workspace"}.pulse`}
                />
                <NetworkLinkRow icon={Mail} value={email} />
                <NetworkLinkRow icon={Phone} value={phoneDisplay} />
                <NetworkLinkRow icon={MapPin} value={officeAddress} />
              </View>
            </View>

            <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>About</Text>
            <Text style={styles.aboutBody}>
              {orgName} uses Pulse to manage clients, suppliers, and fleet partners on one
              network. Connect with verified organisations to share trips, indents, and
              ledger entries across your {modelLabel.toLowerCase()} workspace.
            </Text>

            <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>Products</Text>
            <View style={styles.tagWrap}>
              {[
                "Trip management",
                canPostLoads ? "Load posting" : "Load viewing",
                canBid ? "Market bidding" : "Partner matching",
                canManageAssets ? "Asset fleet" : "Partner fleet",
                marketplaceOn ? "Marketplace" : "Private network",
                "Ledger sync",
              ].map((product) => (
                <View key={product} style={styles.productPill}>
                  <Text style={styles.productPillText}>{product}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, styles.cardTitleInline]}>Locations</Text>
              <Pressable
                style={styles.offerLocationBtn}
                onPress={openAddLocation}
                accessibilityRole="button"
                accessibilityLabel="Offer location"
              >
                <MapPin size={12} color={Theme.textOnPrimary} strokeWidth={2.4} />
                <Text style={styles.offerLocationBtnText}>Offer location</Text>
              </Pressable>
            </View>
            {locationsQ.isLoading ? (
              <View style={styles.locationsEmpty}>
                <ActivityIndicator color={METRONIC.muted} />
              </View>
            ) : locationCards.length === 0 ? (
              <View style={styles.locationsEmpty}>
                <Text style={styles.locationsEmptyText}>
                  No locations yet. Add your first hub or office.
                </Text>
                <Pressable style={styles.offerLocationBtn} onPress={openAddLocation}>
                  <MapPin size={12} color={Theme.textOnPrimary} strokeWidth={2.4} />
                  <Text style={styles.offerLocationBtnText}>Offer location</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.locationsGrid}>
                {locationCards.map((card, i) => {
                  const gradient = LOCATION_TYPE_GRADIENTS[card.locationType];
                  const { line1, line2 } = formatLocationSubtitle(
                    i + 1,
                    card.department,
                    card.city,
                    card.state,
                    card.verified,
                  );
                  return (
                    <Pressable
                      key={card.id}
                      style={({ pressed }) => [
                        styles.locationCard,
                        styles.locationCardPressable,
                        Platform.OS === "web"
                          ? ({ cursor: "pointer" } as ViewStyle)
                          : null,
                        pressed && { opacity: 0.92 },
                      ]}
                      onPress={() => openLocationDetail(card)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${card.name}`}
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
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Projects</Text>
              <Pressable hitSlop={8}>
                <MoreHorizontal size={16} color={METRONIC.muted} />
              </Pressable>
            </View>
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
                style={[styles.projectsRow, idx === projectRows.length - 1 && styles.projectsRowLast]}
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
          </View>
        </View>
      </View>

      <View style={styles.activityCard}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>Recent activity</Text>
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

      {orgId ? (
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
      ) : null}
    </View>
  );
}
