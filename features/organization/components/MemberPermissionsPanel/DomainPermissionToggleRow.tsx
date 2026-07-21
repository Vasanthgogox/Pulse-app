/**
 * Expandable domain access row — Webild-inspired soft card + switch.
 * Visual language: https://www.webild.io/
 */
import {
  permissionLabel,
  PLATFORM_ROLE_GRANTS,
  type FunctionalRole,
} from "@/features/organization/utils/teamInviteRoles.util";
import { Check, ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

/** Webild spectrum accents per domain. */
const DOMAIN_ACCENT: Record<FunctionalRole, string> = {
  finance: "#0894FF",
  sales: "#C959DD",
  tripops: "#FF9004",
};

export type DomainToggleRowDef = {
  key: FunctionalRole;
  label: string;
  hint: string;
  grantRole: FunctionalRole;
};

type Props = {
  def: DomainToggleRowDef;
  enabled: boolean;
  canEdit: boolean;
  orgAllows: boolean;
  onToggle: (next: boolean) => void;
};

export function DomainPermissionToggleRow({
  def,
  enabled,
  canEdit,
  orgAllows,
  onToggle,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const grants = PLATFORM_ROLE_GRANTS[def.grantRole];
  const lockedByOrg = !orgAllows;
  const switchOn = enabled && orgAllows;
  const accent = DOMAIN_ACCENT[def.key];

  return (
    <View style={[styles.card, switchOn && styles.cardOn]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <View style={styles.copy}>
          <Text style={styles.label}>{def.label}</Text>
          <Text style={styles.hint} numberOfLines={2}>
            {lockedByOrg
              ? "Not available for this workspace operating model"
              : def.hint}
          </Text>
        </View>
        <Switch
          value={switchOn}
          disabled={!canEdit || lockedByOrg}
          onValueChange={onToggle}
          trackColor={{ false: "#E8E8E8", true: accent }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#E8E8E8"
          accessibilityLabel={`${def.label} access`}
        />
      </View>

      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={({ pressed }) => [styles.expandBtn, pressed && { opacity: 0.7 }]}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Hide permissions" : "View permissions"}
      >
        <Text style={styles.expandText}>
          {expanded ? "Hide" : "View"} {grants.length} permissions
        </Text>
        {expanded ? (
          <ChevronUp size={14} color="#737373" strokeWidth={2} />
        ) : (
          <ChevronDown size={14} color="#737373" strokeWidth={2} />
        )}
      </Pressable>

      {expanded ? (
        <View style={styles.chips}>
          {grants.map((grant) => (
            <View key={grant} style={styles.chip}>
              <Check size={10} color={accent} strokeWidth={2.8} />
              <Text style={styles.chipText}>{permissionLabel(grant)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const DOMAIN_TOGGLE_ROWS: DomainToggleRowDef[] = [
  {
    key: "finance",
    label: "Finance",
    hint: "Fiscal tab — cash, invoicing, and ledgers",
    grantRole: "finance",
  },
  {
    key: "sales",
    label: "Sales / Network",
    hint: "Network tab — marketplace, clients, and connections",
    grantRole: "sales",
  },
  {
    key: "tripops",
    label: "TripOps",
    hint: "Trips tab — dispatch, indents, and execution",
    grantRole: "tripops",
  },
];

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FBFBFB",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EEEEEE",
    gap: 4,
  },
  cardOn: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E4E4E4",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#171717",
    letterSpacing: -0.3,
  },
  hint: {
    fontSize: 12,
    color: "#737373",
    lineHeight: 16,
    letterSpacing: -0.1,
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 22,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  expandText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#737373",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingLeft: 22,
    paddingBottom: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E5E5",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#404040",
    letterSpacing: -0.1,
  },
});
