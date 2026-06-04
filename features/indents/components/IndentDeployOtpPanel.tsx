import { memo } from "react";
import {
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";

import Theme from "@/constants/Theme";
import { regenerateTripOtp } from "@/features/trips/services/tripOtp.service";

export type IndentDeployOtpPanelProps = {
  code: string;
  expiresAt: string | null;
  tripId: string | null;
  onCodeChange: (code: string, expiresAt: string | null) => void;
  onCopied?: () => void;
};

export const IndentDeployOtpPanel = memo(function IndentDeployOtpPanel({
  code,
  expiresAt,
  tripId,
  onCodeChange,
  onCopied,
}: IndentDeployOtpPanelProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>Share this code with the driver to claim the trip.</Text>
      <View style={styles.card}>
        <Text style={styles.code}>{code}</Text>
        {expiresAt ? (
          <Text style={styles.expiry}>
            Expires {new Date(expiresAt).toLocaleString()}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => {
              void Clipboard.setStringAsync(code).then(() => onCopied?.());
            }}
          >
            <Text style={styles.btnText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => {
              void Share.share({
                message: `Claim this trip with code: ${code}`,
                title: "Trip claim code",
              });
            }}
          >
            <Text style={styles.btnText}>Share</Text>
          </TouchableOpacity>
          {tripId ? (
            <TouchableOpacity
              style={styles.btn}
              onPress={async () => {
                const { code: next, expires_at } = await regenerateTripOtp(tripId);
                if (next) onCodeChange(next, expires_at ?? null);
              }}
            >
              <Text style={styles.btnText}>Regenerate</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hint: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textRouteCard,
    lineHeight: 18,
  },
  card: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  code: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 6,
    color: Theme.textPrimaryDark,
  },
  expiry: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    justifyContent: "center",
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  btnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.primary,
  },
});
