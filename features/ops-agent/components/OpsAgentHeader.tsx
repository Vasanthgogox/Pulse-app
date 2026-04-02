import { Text, TouchableOpacity, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useLanguage } from "@/contexts/LanguageContext";
import type { OpsRef } from "../types";
import type { OpsAgentStyles } from "../opsAgentStyles";

interface OpsAgentHeaderProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  userInitial: string;
  styles: OpsAgentStyles;
  themeRef: OpsRef;
  topInset: number;
}

export function OpsAgentHeader({
  isDarkMode,
  onToggleTheme,
  userInitial,
  styles,
  themeRef: REF,
  topInset,
}: OpsAgentHeaderProps) {
  const router = useRouter();
  const { t } = useLanguage();
  return (
    <View style={[styles.refHeader, { paddingTop: topInset + 14 }]}>
      <View style={styles.refHeaderLeft}>
        <TouchableOpacity
          onPress={() => {
            // Ops Agent is a tab root screen; going "back" can land on /sign-in (history)
            // which feels like the user got signed out. Always route to an in-app tab.
            router.replace("/(tabs)/finance");
          }}
          style={styles.refBackBtn}
          hitSlop={12}
        >
          <Feather name="chevron-left" size={20} color={REF.text} strokeWidth={1.5} />
        </TouchableOpacity>
        <View style={styles.refStatusDot} />
        <Text style={styles.refHeaderTitle}>{t("opsAgent")}</Text>
        <Text style={styles.refHeaderMeta}>· gemini-2.0-flash</Text>
      </View>
      <View style={styles.refHeaderRight}>
        <TouchableOpacity
          onPress={onToggleTheme}
          style={[styles.refHeaderBtn, { paddingVertical: 8, paddingHorizontal: 8 }]}
          hitSlop={8}
          accessibilityLabel={isDarkMode ? t("switchToLightMode") : t("switchToDarkMode")}
        >
          <FontAwesome name={isDarkMode ? "sun-o" : "moon-o"} size={18} color={REF.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.refAvatar} onPress={() => router.push("/(tabs)/profile")}>
          <Text style={styles.refAvatarText}>{userInitial}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
