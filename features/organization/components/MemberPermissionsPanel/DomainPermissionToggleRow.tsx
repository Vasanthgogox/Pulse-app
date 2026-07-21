/**
 * Domain accordion with drill-down surface toggles (full RBAC catalog).
 * Surfaces unavailable for the org operating model render locked/off.
 * Wide layouts use a 2-column action grid to cut vertical scroll.
 */
import {
  applySurfaceToggle,
  memberHasSurface,
  orgAllowsSurface,
  surfacesForDomain,
  type MemberSurfaceId,
  type MemberSurfaceMap,
} from "@/lib/memberSurfaces";
import type { Capability } from "@/lib/capabilities";
import type { FunctionalRole } from "@/features/organization/utils/teamInviteRoles.util";
import { ChevronDown, ChevronUp, Lock } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const DOMAIN_ACCENT: Record<FunctionalRole | "fleet" | "team", string> = {
  finance: "#0894FF",
  sales: "#C959DD",
  tripops: "#FF9004",
  fleet: "#0894FF",
  team: "#171717",
};

export type DomainToggleRowDef = {
  key: FunctionalRole;
  label: string;
  hint: string;
};

type Props = {
  def: DomainToggleRowDef;
  /** Domain master switch (tab-level). */
  domainEnabled: boolean;
  surfaces: MemberSurfaceMap;
  orgCaps: Capability[];
  canEdit: boolean;
  orgAllowsDomain: boolean;
  /** Start expanded (default: false — less scroll on first paint). */
  defaultExpanded?: boolean;
  onToggleDomain: (next: boolean) => void;
  onToggleSurface: (id: MemberSurfaceId, next: boolean) => void;
};

export function DomainPermissionToggleRow({
  def,
  domainEnabled,
  surfaces,
  orgCaps,
  canEdit,
  orgAllowsDomain,
  defaultExpanded = false,
  onToggleDomain,
  onToggleSurface,
}: Props) {
  const { width } = useWindowDimensions();
  const twoColSurfaces = width >= 720;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const accent = DOMAIN_ACCENT[def.key];
  const lockedByOrg = !orgAllowsDomain;
  const switchOn = domainEnabled && orgAllowsDomain;

  const rows = useMemo(() => {
    const primary = surfacesForDomain(def.key);
    const extra =
      def.key === "tripops" ? surfacesForDomain("fleet") : [];
    return [...primary, ...extra];
  }, [def.key]);

  const enabledCount = rows.filter((r) =>
    memberHasSurface(orgCaps, surfaces, r.id, false),
  ).length;
  const availableCount = rows.filter((r) => orgAllowsSurface(orgCaps, r.id)).length;

  return (
    <View style={[styles.card, switchOn && styles.cardOn]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <View style={styles.copy}>
          <Text style={styles.label}>{def.label}</Text>
          <Text style={styles.hint} numberOfLines={1}>
            {lockedByOrg
              ? "Not available for this workspace operating model"
              : def.hint}
          </Text>
        </View>
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={({ pressed }) => [
            styles.expandChip,
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={6}
          accessibilityRole="button"
        >
          <Text style={styles.expandText}>
            {expanded ? "Hide" : "Show"} {availableCount}
            {availableCount > 0 ? ` · ${enabledCount} on` : ""}
          </Text>
          {expanded ? (
            <ChevronUp size={14} color="#737373" strokeWidth={2} />
          ) : (
            <ChevronDown size={14} color="#737373" strokeWidth={2} />
          )}
        </Pressable>
        <Switch
          value={switchOn}
          disabled={!canEdit || lockedByOrg}
          onValueChange={onToggleDomain}
          trackColor={{ false: "#E8E8E8", true: accent }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#E8E8E8"
          accessibilityLabel={`${def.label} domain`}
        />
      </View>

      {expanded ? (
        <View
          style={[
            styles.surfaceList,
            twoColSurfaces && styles.surfaceListGrid,
          ]}
        >
          {rows.map((surface) => {
            const orgOk = orgAllowsSurface(orgCaps, surface.id);
            const on = memberHasSurface(orgCaps, surfaces, surface.id, false);
            return (
              <View
                key={surface.id}
                style={[
                  styles.surfaceRow,
                  twoColSurfaces ? styles.surfaceRowHalf : styles.surfaceRowFull,
                  !orgOk && styles.surfaceRowMuted,
                ]}
              >
                <View style={styles.surfaceCopy}>
                  <Text
                    style={[
                      styles.surfaceLabel,
                      !orgOk && styles.surfaceMuted,
                    ]}
                    numberOfLines={1}
                  >
                    {surface.label}
                  </Text>
                  <Text style={styles.surfaceHint} numberOfLines={1}>
                    {!orgOk ? "Blocked by operating model" : surface.hint}
                  </Text>
                </View>
                {!orgOk ? (
                  <Lock size={14} color="#A3A3A3" strokeWidth={2} />
                ) : (
                  <Switch
                    value={on}
                    disabled={!canEdit || !switchOn}
                    onValueChange={(next) => onToggleSurface(surface.id, next)}
                    trackColor={{ false: "#E8E8E8", true: accent }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor="#E8E8E8"
                    accessibilityLabel={surface.label}
                  />
                )}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export const DOMAIN_TOGGLE_ROWS: DomainToggleRowDef[] = [
  {
    key: "finance",
    label: "Finance",
    hint: "Fiscal tab, ledgers, invoicing, POD",
  },
  {
    key: "sales",
    label: "Sales / Network",
    hint: "Network, clients, marketplace, suppliers",
  },
  {
    key: "tripops",
    label: "TripOps + Fleet",
    hint: "Trips, indents, assign, vehicles, drivers",
  },
];

/** Re-export helper for parent panel cascade. */
export { applySurfaceToggle };

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FBFBFB",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEEEEE",
    gap: 0,
  },
  cardOn: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E4E4E4",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#171717",
    letterSpacing: -0.3,
  },
  hint: {
    fontSize: 11,
    color: "#737373",
    lineHeight: 14,
    letterSpacing: -0.1,
  },
  expandChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#F3F3F3",
  },
  expandText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#737373",
  },
  surfaceList: {
    gap: 2,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F0F0F0",
  },
  surfaceListGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    rowGap: 2,
  },
  surfaceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  surfaceRowFull: {
    width: "100%",
  },
  surfaceRowHalf: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "48%",
    maxWidth: "49.5%",
    backgroundColor: "#FAFAFA",
  },
  surfaceRowMuted: {
    opacity: 0.7,
  },
  surfaceCopy: { flex: 1, minWidth: 0, gap: 1 },
  surfaceLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#171717",
    letterSpacing: -0.2,
  },
  surfaceMuted: { color: "#A3A3A3" },
  surfaceHint: {
    fontSize: 10,
    color: "#A3A3A3",
    lineHeight: 13,
  },
});
