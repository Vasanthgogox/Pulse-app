/**
 * Client-side gate for the 3 primary tabs (Fiscal / Trips / Network) — blocks a
 * member whose functional role doesn't cover this domain (see useMemberCapabilities).
 * Same redirect-on-deny pattern as ModelAccessGate.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOptionalLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/lib/routes";
import {
  memberHomeRouteFromAccess,
  useMemberCapabilities,
  type MemberDomainAccess,
} from "@/lib/useMemberCapabilities";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

export type MemberDomainKind = keyof MemberDomainAccess;

type Props = {
  kind: MemberDomainKind;
  children: ReactNode;
};

export function MemberDomainGate({ kind, children }: Props) {
  const router = useRouter();
  const access = useMemberCapabilities();
  const { t } = useOptionalLanguage();
  // On desktop web the tab layout mounts all three tab scenes at once
  // (`lazy: false`), so an unfocused denied gate must NOT fire a redirect or
  // render the notice — only the scene the user is actually on should act.
  const isFocused = useIsFocused();
  const allowed = access[kind];
  const isLoading = access.isLoading;
  // The member's own landing tab. When they have another reachable domain we
  // bounce them there instead of parking them on a neutral dead-end. `null` =
  // no functional role at all → nowhere to send them, show the notice below.
  const home = memberHomeRouteFromAccess(access);

  useEffect(() => {
    // Hold while the workspace/role is still resolving — bouncing here would
    // eject a legitimately-allowed member before their functional role loads.
    if (!isFocused || isLoading || allowed) return;
    if (!home || home === ROUTES.TABS[kindToTab(kind)]) return;
    // Always replace() (not back()): on a hard web load / deep-link the
    // navigator has no history and back() dispatches an unhandled GO_BACK.
    router.replace(home as "/");
  }, [isFocused, isLoading, allowed, home, kind, router]);

  if (isLoading) {
    // Inert placeholder — NOT the branded AppLoadingSplash (canvas-based, crashes
    // when mounted in this pre-nav route window in prod). A gate only needs to
    // hold a blank frame for the few ms until access resolves or the redirect fires.
    return <View style={{ flex: 1 }} />;
  }

  if (allowed) return <>{children}</>;

  // Denied but either not the focused scene (background-mounted on desktop) or
  // we have somewhere to redirect — hold blank for the frame until replace() fires.
  if (!isFocused || home) return <View style={{ flex: 1 }} />;

  // Denied with no reachable domain (member has no functional role). Redirecting
  // would loop, so render a clear notice instead of a blank screen.
  return (
    <View style={styles.noticeWrap}>
      <Text style={styles.noticeTitle}>{t("memberNoAccessTitle")}</Text>
      <Text style={styles.noticeBody}>{t("memberNoAccessBody")}</Text>
    </View>
  );
}

function kindToTab(kind: MemberDomainKind): "FINANCE" | "TRIPS" | "NETWORK" {
  if (kind === "finance") return "FINANCE";
  if (kind === "tripops") return "TRIPS";
  return "NETWORK";
}

const styles = StyleSheet.create({
  noticeWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimary,
    textAlign: "center",
    marginBottom: Layout.spacingSmall,
  },
  noticeBody: {
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: "center",
    maxWidth: 320,
  },
});
