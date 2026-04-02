/**
 * SMS OTP parsing (Method 2: Android) — UI for enabling / learning about
 * auto-read OTP from incoming SMS on Android. Entry point from profile.
 * Shows last received OTP in-app when native bridge is available.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  getLastParsedOtp,
  isSmsOtpSupported,
  subscribeToSmsOtpParsed,
  type ParsedOtp,
} from "@/lib/smsOtpBridge";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function LastOtpCard({ otp }: { otp: ParsedOtp | null }) {
  if (Platform.OS !== "android") {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.sectionTitle}>Last received OTP</Text>
        <Text style={styles.body}>Not available on iOS. Use an Android device to test.</Text>
      </View>
    );
  }
  if (!otp) {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.sectionTitle}>Last received OTP</Text>
        <Text style={styles.body}>
          No OTP received yet. Send an SMS to this device with a 4–8 digit code (e.g. "Your code is 123456") to see it here.
        </Text>
      </View>
    );
  }
  const timeStr = new Date(otp.time).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <View style={[styles.card, styles.cardHighlight]}>
      <View style={styles.otpHeader}>
        <FontAwesome name="check-circle" size={20} color={Theme.darkGreen} />
        <Text style={styles.sectionTitle}>Last received OTP</Text>
      </View>
      <Text style={styles.otpCode}>{otp.code}</Text>
      <Text style={styles.otpMeta}>From: {otp.sender || "—"} · {timeStr}</Text>
      {otp.body ? (
        <Text style={styles.otpBody} numberOfLines={2}>{otp.body}</Text>
      ) : null}
    </View>
  );
}

export default function SmsOtpParsingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [lastOtp, setLastOtp] = useState<ParsedOtp | null>(null);

  useEffect(() => {
    if (!isSmsOtpSupported()) return;
    getLastParsedOtp().then(setLastOtp);
    const unsub = subscribeToSmsOtpParsed((otp) => setLastOtp(otp));
    return unsub;
  }, []);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <FontAwesome name="arrow-left" size={20} color={Theme.textOnDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SMS OTP (Android)</Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Layout.sectionSpacing,
            paddingBottom: Layout.modalBottomPadding + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <LastOtpCard otp={lastOtp} />

        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <FontAwesome name="mobile-phone" size={28} color={Theme.primary} />
          </View>
          <Text style={styles.title}>Auto-read OTP from SMS (Android)</Text>
          <Text style={styles.body}>
            On Android, the app can listen for incoming SMS and automatically
            extract OTP codes (e.g. for trip claim or verification). This uses
            Method 2: a native BroadcastReceiver that parses incoming message
            PDUs.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>How it works</Text>
          <Text style={styles.body}>
            1. The app requests RECEIVE_SMS permission.{"\n"}
            2. A BroadcastReceiver wakes when an SMS arrives.{"\n"}
            3. The message is decoded from PDU format; the body and sender are
            read.{"\n"}
            4. A short numeric code (4–8 digits) is extracted and can be passed
            to the app (e.g. to the trip OTP claim screen).
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Setup</Text>
          <Text style={styles.body}>
            The native code lives in{" "}
            <Text style={styles.code}>native/android-sms-parsing/</Text>. After
            running <Text style={styles.code}>npx expo prebuild</Text>, merge the
            manifest snippet and add <Text style={styles.code}>SmsReceiver.kt</Text>{" "}
            into your Android project. See the README in that folder for steps.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>How to test</Text>
          <Text style={styles.body}>
            1. Rebuild: npx expo run:android{"\n"}
            2. Grant the app SMS permission (Settings → App → Permissions).{"\n"}
            3. Send an SMS to this device with a 4–8 digit code (e.g. "Your code is 123456").{"\n"}
            4. Run: adb logcat -s SmsReceiver:D — you should see "SMS OTP parsed: code=..."
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>iOS</Text>
          <Text style={styles.body}>
            iOS does not allow apps to read incoming SMS. This feature is
            Android-only. On iPhone, continue entering OTP manually.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Theme.darkBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Theme.textOnDark,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  card: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    padding: Layout.sectionSpacing,
    marginBottom: Layout.sectionSpacing,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimary,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: Theme.textSecondary,
  },
  code: {
    fontFamily: "monospace",
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 13,
    color: Theme.textPrimary,
  },
  cardMuted: {
    borderColor: Theme.borderLight,
  },
  cardHighlight: {
    borderColor: Theme.darkGreen,
    backgroundColor: Theme.positiveMuted,
  },
  otpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  otpCode: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 4,
    color: Theme.textPrimary,
    marginBottom: 4,
  },
  otpMeta: {
    fontSize: 13,
    color: Theme.textSecondary,
    marginBottom: 4,
  },
  otpBody: {
    fontSize: 13,
    color: Theme.textMuted,
    fontStyle: "italic",
  },
});
