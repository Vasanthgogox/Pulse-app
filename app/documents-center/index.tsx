/**
 * Documents Center — central Compliance & Document Intelligence hub.
 *
 * Routed from:
 *   • `TeslaHeader` "folder-open" icon          (via `onDocumentsClick`)
 *   • `HomePageHeader` "folder-open" icon       (default route)
 *   • Compliance-block error in trip allocation (future Phase 7)
 *
 * The screen is just a thin shell: header + the `DocumentCenter`
 * component owns all dashboard/list state. Keep it that way so the
 * same component can be reused inside a modal sheet from other entry
 * points (e.g. a vehicle/driver detail "open in Doc Center" link).
 */

import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import Theme from "@/constants/Theme";
import { TeslaHeader } from "@/components/TeslaHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import { DocumentCenter } from "@/features/compliance/components/DocumentCenter";

export default function DocumentsCenterScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <View style={styles.root}>
      <TeslaHeader
        title={t("complianceDocumentsCenter")}
        subtitle={t("complianceDocumentsCenterTagline")}
        showBack
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/network" as Parameters<typeof router.replace>[0]);
        }}
      />
      <DocumentCenter />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
});
