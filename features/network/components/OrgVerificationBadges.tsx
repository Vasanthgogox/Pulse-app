/**
 * Shared Verified / Not verified (+ optional Recommended) tags for network UI.
 */
import Theme from "@/constants/Theme";
import {
  orgVerificationTagLabel,
  resolveOrgVerificationState,
  shouldShowRecommended,
  type OrgVerificationInput,
  type OrgVerificationState,
} from "@/features/network/utils/orgVerification.util";
import { BadgeCheck, ShieldAlert } from "lucide-react-native";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  verification?: OrgVerificationInput;
  /** When set, skips resolving from `verification`. */
  state?: OrgVerificationState;
  /** Show Recommended when verified (default true). */
  showRecommended?: boolean;
  /** Hide badges entirely (e.g. driver rows without org KYC). */
  hidden?: boolean;
  compact?: boolean;
  /** Use light chips on dark hero backgrounds (connection invite modal). */
  tone?: "default" | "onDark";
  style?: StyleProp<ViewStyle>;
};

export function OrgVerificationBadges({
  verification,
  state: stateProp,
  showRecommended = true,
  hidden = false,
  compact = false,
  tone = "default",
  style,
}: Props) {
  if (hidden) return null;
  const state = stateProp ?? resolveOrgVerificationState(verification);
  const label = orgVerificationTagLabel(state);
  const recommended = showRecommended && shouldShowRecommended(state);
  const onDark = tone === "onDark";

  return (
    <View style={[styles.row, compact && styles.rowCompact, style]}>
      <View
        style={[
          styles.tag,
          compact && styles.tagCompact,
          onDark
            ? state === "verified"
              ? styles.tagVerifiedOnDark
              : state === "pending"
                ? styles.tagPendingOnDark
                : styles.tagNotVerifiedOnDark
            : state === "verified"
              ? styles.tagVerified
              : state === "pending"
                ? styles.tagPending
                : styles.tagNotVerified,
        ]}
      >
        {state === "verified" ? (
          <BadgeCheck
            size={compact ? 9 : 10}
            color={onDark ? Theme.textOnPrimary : Theme.darkGreen}
            strokeWidth={2.4}
          />
        ) : (
          <ShieldAlert
            size={compact ? 9 : 10}
            color={
              onDark
                ? Theme.textOnPrimary
                : state === "pending"
                  ? Theme.warning
                  : Theme.textSecondary
            }
            strokeWidth={2.4}
          />
        )}
        <Text
          style={[
            styles.tagText,
            compact && styles.tagTextCompact,
            onDark
              ? styles.tagTextOnDark
              : state === "verified"
                ? styles.tagTextVerified
                : state === "pending"
                  ? styles.tagTextPending
                  : styles.tagTextNotVerified,
          ]}
        >
          {label}
        </Text>
      </View>
      {recommended ? (
        <View
          style={[
            styles.tag,
            compact && styles.tagCompact,
            onDark ? styles.tagRecommendedOnDark : styles.tagRecommended,
          ]}
        >
          <Text
            style={[
              styles.tagText,
              compact && styles.tagTextCompact,
              onDark ? styles.tagTextOnDark : styles.tagTextRecommended,
            ]}
          >
            RECOMMENDED
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  rowCompact: {
    gap: 3,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagCompact: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagVerified: {
    backgroundColor: "rgba(21, 128, 61, 0.12)",
    borderColor: "rgba(21, 128, 61, 0.28)",
  },
  tagPending: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.28)",
  },
  tagNotVerified: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  tagRecommended: {
    backgroundColor: Theme.aggregatePillBg,
    borderColor: Theme.aggregatePillBorder,
  },
  tagText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  tagTextCompact: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.25,
  },
  tagTextVerified: {
    color: Theme.darkGreen,
  },
  tagTextPending: {
    color: Theme.warning,
  },
  tagTextNotVerified: {
    color: Theme.textSecondary,
  },
  tagTextRecommended: {
    color: Theme.aggregatePillText,
  },
  tagVerifiedOnDark: {
    backgroundColor: "rgba(80, 205, 137, 0.22)",
    borderColor: "rgba(80, 205, 137, 0.45)",
  },
  tagPendingOnDark: {
    backgroundColor: "rgba(246, 192, 0, 0.22)",
    borderColor: "rgba(246, 192, 0, 0.4)",
  },
  tagNotVerifiedOnDark: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.28)",
  },
  tagRecommendedOnDark: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderColor: "rgba(255, 255, 255, 0.32)",
  },
  tagTextOnDark: {
    color: Theme.textOnPrimary,
  },
});
