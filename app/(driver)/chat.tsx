/**
 * Driver chat — Slack-style trip threads (aligned with business Command Hub chat).
 */
import { AppLoadingSplash } from "@/components/AppLoadingSplash";
import { DriverChatSlackInbox } from "@/features/chat/components/driver/DriverChatSlackInbox";
import { DriverChatSlackThread } from "@/features/chat/components/driver/DriverChatSlackThread";
import { useDriverChat } from "@/features/chat/contexts/DriverChatContext";
import type { TripConversation } from "@/features/chat/types/chat.types";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalSearchParams, useRouter } from "expo-router";
import Layout from "@/constants/Layout";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { MessageSquare } from "lucide-react-native";
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

  const {
    conversations,
    isLoading,
    sendMessage,
    markAsRead,
    ensureDriverTripConversation,
  } = useDriverChat();

  const ensureConvRef = useRef(ensureDriverTripConversation);
  const markReadRef = useRef(markAsRead);
  ensureConvRef.current = ensureDriverTripConversation;
  markReadRef.current = markAsRead;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingConvOrgId, setPendingConvOrgId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [openingTripThread, setOpeningTripThread] = useState(false);
  const [tripThreadError, setTripThreadError] = useState<string | null>(null);

  useEffect(() => {
    if (!normalizedTripId) {
      setOpeningTripThread(false);
      setTripThreadError(null);
      return;
    }
    let cancelled = false;
    setOpeningTripThread(true);
    setTripThreadError(null);
    setSelectedId(null);
    setPendingConvOrgId(null);
    setMessageInput("");
    void ensureConvRef.current(normalizedTripId)
      .then((result) => {
        if (cancelled) return;
        setOpeningTripThread(false);
        if (result) {
          setPendingConvOrgId(result.orgId);
          setSelectedId(result.convId);
          void markReadRef.current(result.convId);
        } else {
          setTripThreadError("Could not open chat for this trip.");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setOpeningTripThread(false);
        setTripThreadError("Could not open chat for this trip.");
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedTripId]);

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;
  const resolvedOrgId = selectedConv?.organization_id ?? pendingConvOrgId;

  const handleSend = async () => {
    const text = messageInput.trim();
    if (!text || !selectedId || !resolvedOrgId) return;
    setMessageInput("");
    await sendMessage(selectedId, resolvedOrgId, text);
  };

  const openConv = (conv: TripConversation) => {
    setSelectedId(conv.id);
    setPendingConvOrgId(conv.organization_id);
    markAsRead(conv.id);
    setMessageInput("");
  };

  const renderThread = (conv: Partial<TripConversation> & {
    id: string;
    organization_id?: string;
    trip_id: string;
  }) => (
    <DriverChatSlackThread
      conversationId={conv.id}
      organizationId={conv.organization_id ?? resolvedOrgId ?? ""}
      tripId={conv.trip_id}
      tripNumber={conv.trip_number ?? ""}
      pickupArea={conv.pickup_area ?? ""}
      dropLocation={conv.drop_location ?? ""}
      fleetName={conv.party_name ?? conv.trip_organization_name}
      messageInput={messageInput}
      setMessageInput={setMessageInput}
      onSend={() => void handleSend()}
      onSendTripChat={(text) =>
        sendMessage(conv.id, conv.organization_id ?? resolvedOrgId ?? "", text)
      }
      onBack={() => {
        setSelectedId(null);
        setPendingConvOrgId(null);
        setMessageInput("");
        if (normalizedTripId) router.back();
      }}
    />
  );

  if (normalizedTripId) {
    if (openingTripThread) {
      return (
        <View style={[{ flex: 1, backgroundColor: "#FFFFFF" }, screenPadding]}>
          <AppLoadingSplash variant="preparing" style={{ flex: 1 }} />
        </View>
      );
    }
    if (tripThreadError) {
      return (
        <View
          style={[
            { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 24 },
            screenPadding,
          ]}
        >
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}>
            <MessageSquare size={40} color="#e2e8f0" />
            <Text style={{ fontSize: 15, color: "#475569", textAlign: "center" }}>
              {tripThreadError}
            </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                marginTop: 4,
                backgroundColor: "#0f172a",
                paddingHorizontal: 22,
                paddingVertical: 12,
                borderRadius: 12,
              }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (selectedId && resolvedOrgId) {
      return (
        <View style={[{ flex: 1, backgroundColor: "#FFFFFF" }, screenPadding]}>
          {renderThread({
            id: selectedId,
            organization_id: resolvedOrgId,
            trip_id: selectedConv?.trip_id ?? normalizedTripId,
            trip_number: selectedConv?.trip_number,
            pickup_area: selectedConv?.pickup_area,
            drop_location: selectedConv?.drop_location,
            party_name: selectedConv?.party_name,
            trip_organization_name: selectedConv?.trip_organization_name,
          })}
        </View>
      );
    }

    return (
      <View style={[{ flex: 1, backgroundColor: "#FFFFFF" }, screenPadding]}>
        <AppLoadingSplash variant="preparing" style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <View style={[{ flex: 1, backgroundColor: "#FFFFFF" }, screenPadding]}>
      {!selectedConv ? (
        <DriverChatSlackInbox
          conversations={conversations}
          isLoading={isLoading}
          selectedId={selectedId}
          profileName={profile?.full_name ?? profile?.displayName ?? undefined}
          profileAvatarUrl={profile?.avatar_url ?? null}
          profileAvatarSeed={profile?.avatar_seed ?? null}
          onBack={() =>
            router.canGoBack() ? router.back() : router.replace("/(driver)")
          }
          onOpenConv={openConv}
        />
      ) : (
        renderThread(selectedConv)
      )}
    </View>
  );
}
