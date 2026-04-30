import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FileText, ExternalLink } from "lucide-react-native";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";
import type { DocumentShareMetadata, TripMessageRow } from "../types/chat.types";

interface DocumentShareCardProps {
  message: TripMessageRow;
  isOwn: boolean;
}

export function DocumentShareCard({ message, isOwn }: DocumentShareCardProps) {
  const meta = message.metadata as DocumentShareMetadata | null;
  const [opening, setOpening] = useState(false);

  if (!meta) return null;

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  const handleOpen = async () => {
    setOpening(true);
    try {
      let url = meta.storage_path;
      // If it's a Supabase storage path (not already a signed URL), generate one
      if (!url.startsWith("http")) {
        const { data } = supabase().storage
          .from("documents")
          .getPublicUrl(url);
        url = data?.publicUrl ?? url;
      }
      await WebBrowser.openBrowserAsync(url);
    } catch {
      // fail silently
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={[s.card, isOwn ? s.cardOwn : s.cardOther]}>
      <View style={s.header}>
        <View style={[s.iconWrap, { backgroundColor: isOwn ? "rgba(255,255,255,0.18)" : "#eff6ff" }]}>
          <FileText size={16} color={isOwn ? "#fff" : "#3b82f6"} />
        </View>
        <View style={s.info}>
          <Text style={[s.docType, isOwn && s.textOwn]} numberOfLines={1}>
            {meta.document_type.toUpperCase()}
          </Text>
          <Text style={[s.docName, isOwn && s.textOwn]} numberOfLines={1}>
            {meta.document_name}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[s.openBtn, isOwn ? s.openBtnOwn : s.openBtnOther]}
        onPress={handleOpen}
        disabled={opening}
        activeOpacity={0.8}
      >
        {opening ? (
          <ActivityIndicator size="small" color={isOwn ? "#5b5ef4" : "#fff"} />
        ) : (
          <>
            <ExternalLink size={12} color={isOwn ? "#5b5ef4" : "#fff"} />
            <Text style={[s.openText, isOwn ? s.openTextOwn : s.openTextOther]}>
              View Document
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={[s.time, isOwn && { textAlign: "right", color: "rgba(255,255,255,0.6)" }]}>
        {displayTime} · {message.sender_name.toUpperCase()}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 13,
    maxWidth: "72%",
    borderWidth: 1,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardOwn: {
    backgroundColor: "#5b5ef4",
    borderColor: "transparent",
    alignSelf: "flex-end",
    shadowColor: "#5b5ef4",
  },
  cardOther: {
    backgroundColor: "#fff",
    borderColor: "#e5e7eb",
    alignSelf: "flex-start",
    shadowColor: "#0f172a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  info: { flex: 1, minWidth: 0 },
  docType: {
    fontSize: 9,
    fontWeight: "900",
    color: "#64748b",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  docName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 1,
  },
  textOwn: { color: "#fff" },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  openBtnOwn: { backgroundColor: "#fff" },
  openBtnOther: { backgroundColor: "#3b82f6" },
  openText: { fontSize: 12, fontWeight: "700" },
  openTextOwn: { color: "#5b5ef4" },
  openTextOther: { color: "#fff" },
  time: {
    fontSize: 9,
    color: "#94a3b8",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
