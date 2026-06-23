import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Trash2 } from "lucide-react-native";

import { DetailPageLayout } from "@/components/DetailPageLayout";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import {
  addUserCommodityType,
  loadUserCommodityTypes,
  removeUserCommodityType,
  setPendingCommodityPick,
  type CommodityTypeKind,
} from "@/features/trips/services/userCommodityTypes.storage";

export type AddCommodityTypeScreenProps = {
  kind: CommodityTypeKind;
  onClose: () => void;
};

const COPY = {
  vehicle: {
    title: "Add vehicle type",
    placeholder: "e.g. 22ft MXL, Reefer truck",
    listTitle: "Your vehicle types",
  },
  product: {
    title: "Add product type",
    placeholder: "e.g. Spices, Steel coils",
    listTitle: "Your product types",
  },
} as const;

export function AddCommodityTypeScreen({ kind, onClose }: AddCommodityTypeScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.uid ?? null;
  const copy = COPY[kind];
  const [name, setName] = useState("");
  const [customList, setCustomList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    if (!userId) {
      setCustomList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const store = await loadUserCommodityTypes(userId);
    setCustomList(kind === "vehicle" ? store.vehicleTypes : store.productTypes);
    setLoading(false);
  }, [userId, kind]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Enter a name for this type.");
      return;
    }
    if (!userId) {
      Alert.alert("Sign in required", "Sign in to save your custom types.");
      return;
    }
    setSaving(true);
    try {
      const { added } = await addUserCommodityType(userId, kind, trimmed);
      if (!added) {
        Alert.alert("Invalid name", "Enter at least one character.");
        return;
      }
      await setPendingCommodityPick(userId, { kind, name: added });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (label: string) => {
    if (!userId) return;
    Alert.alert("Remove type?", `"${label}" will be removed from your list.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const store = await removeUserCommodityType(userId, kind, label);
          setCustomList(kind === "vehicle" ? store.vehicleTypes : store.productTypes);
        },
      },
    ]);
  };

  if (!userId) {
    return (
      <DetailPageLayout title={copy.title} onBack={onClose}>
        <Text style={styles.muted}>Sign in to save custom types on this device.</Text>
      </DetailPageLayout>
    );
  }

  return (
    <DetailPageLayout title={copy.title} onBack={onClose}>
      <View style={styles.privacyCard}>
        <Text style={styles.privacyTitle}>Your private list</Text>
        <Text style={styles.privacyBody}>
          Names you add here are saved only on this device for your account. They are not
          shared with your team or added to the global catalog.
        </Text>
      </View>

      <Text style={styles.fieldLabel}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={copy.placeholder}
        placeholderTextColor={Theme.placeholder}
        autoCapitalize="words"
        maxLength={64}
        returnKeyType="done"
        onSubmitEditing={() => void handleSave()}
      />

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={() => void handleSave()}
        disabled={saving}
        activeOpacity={0.9}
      >
        {saving ? (
          <ActivityIndicator color={Theme.textOnPrimary} size="small" />
        ) : (
          <Text style={styles.saveBtnText}>Save & use</Text>
        )}
      </TouchableOpacity>

      <View style={styles.listSection}>
        <Text style={styles.listTitle}>{copy.listTitle}</Text>
        {loading ? (
          <ActivityIndicator color={Theme.primary} style={{ marginTop: 12 }} />
        ) : customList.length === 0 ? (
          <Text style={styles.muted}>No custom types yet. Add one above.</Text>
        ) : (
          customList.map((label) => (
            <View key={label} style={styles.listRow}>
              <Text style={styles.listRowText} numberOfLines={2}>
                {label}
              </Text>
              <Pressable
                onPress={() => handleRemove(label)}
                hitSlop={10}
                accessibilityLabel={`Remove ${label}`}
                style={styles.removeBtn}
              >
                <Trash2 size={16} color={Theme.destructive} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      <View style={{ height: Math.max(insets.bottom, 16) }} />
    </DetailPageLayout>
  );
}

const styles = StyleSheet.create({
  privacyCard: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: Layout.screenPaddingHorizontal,
    marginBottom: 20,
  },
  privacyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
  },
  privacyBody: {
    fontSize: 12,
    lineHeight: 18,
    color: Theme.textSecondary,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "web" ? 12 : 10,
    fontSize: 15,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    marginBottom: 16,
    minHeight: 48,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
    }),
  },
  saveBtn: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  saveBtnDisabled: {
    opacity: 0.65,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  listSection: {
    gap: 8,
  },
  listTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 4,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  listRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  removeBtn: {
    padding: 4,
  },
  muted: {
    fontSize: 13,
    color: Theme.textMuted,
    lineHeight: 18,
  },
});
