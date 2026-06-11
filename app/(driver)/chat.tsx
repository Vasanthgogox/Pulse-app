/**
 * Driver chat — unified trip team rooms (Phase 4).
 */
import { DriverChatSlackInbox } from "@/features/chat/components/driver/DriverChatSlackInbox";
import { TripChatRoomSheet } from "@/features/chat/components/TripChatRoomSheet";
import { useDriverChat } from "@/features/chat/contexts/DriverChatContext";
import type { TripConversation } from "@/features/chat/types/chat.types";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalSearchParams, useRouter } from "expo-router";
import Layout from "@/constants/Layout";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function DriverChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const driverTabBarClearance = useMemo(() => {
    const footerPadTop = 4;
    const footerPadBottom = Math.max(Math.round(insets.bottom * 0.35), 10);
    return Layout.tabBarDockHeight + footerPadTop + footerPadBottom;
  }, [insets.bottom]);

  const screenPadding = useMemo(
    () => ({ paddingTop: 0, paddingBottom: driverTabBarClearance }),
    [driverTabBarClearance],
  );

  const params = useLocalSearchParams<{ tripId?: string | string[] }>();
  const normalizedTripId = useMemo(() => {
    const raw = params.tripId;
    const v = typeof raw === "string" ? raw : raw?.[0];
    const t = v?.trim();
    return t ? t : null;
  }, [params.tripId]);

  const { conversations, isLoading } = useDriverChat();

  const [tripRoomTripId, setTripRoomTripId] = useState<string | null>(null);

  useEffect(() => {
    if (normalizedTripId) setTripRoomTripId(normalizedTripId);
  }, [normalizedTripId]);

  const activeTripRoomId = tripRoomTripId;

  const openConv = (conv: TripConversation) => {
    setTripRoomTripId(conv.trip_id);
  };

  const closeTripRoom = () => {
    setTripRoomTripId(null);
    if (normalizedTripId) router.back();
  };

  return (
    <View style={[{ flex: 1, backgroundColor: "#FFFFFF" }, screenPadding]}>
      {!activeTripRoomId ? (
        <DriverChatSlackInbox
          conversations={conversations}
          isLoading={isLoading}
          selectedId={null}
          profileName={profile?.full_name ?? profile?.displayName ?? undefined}
          profileAvatarUrl={profile?.avatar_url ?? null}
          profileAvatarSeed={profile?.avatar_seed ?? null}
          onBack={() =>
            router.canGoBack() ? router.back() : router.replace("/(driver)")
          }
          onOpenConv={openConv}
        />
      ) : null}
      <TripChatRoomSheet
        visible={!!activeTripRoomId}
        tripId={activeTripRoomId}
        onClose={closeTripRoom}
      />
    </View>
  );
}
