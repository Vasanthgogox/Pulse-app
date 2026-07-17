import FontAwesome from "@expo/vector-icons/FontAwesome";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import type { LedgerCategory } from "../types";
import { styles } from "./FinanceScreen.styles";

const CATEGORY_KEYS: {
  key: LedgerCategory;
  labelKey: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
}[] = [
  { key: "all", labelKey: "all", icon: "th-large" },
  { key: "customers", labelKey: "customersLabel", icon: "users" },
  { key: "suppliers", labelKey: "suppliersLabel", icon: "truck" },
  { key: "vehicle", labelKey: "vehicle", icon: "car" },
  { key: "driver", labelKey: "driver", icon: "user" },
];

export interface EntityListCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  selectedLedgerCategory: LedgerCategory;
  ledgerCategoryCounts: Record<LedgerCategory, number>;
  onSelectCategory: (key: LedgerCategory) => void;
  insetsTop: number;
  /** RBAC-allowed categories; defaults to all. */
  allowedCategories?: readonly LedgerCategory[];
}

export function EntityListCategoryModal({
  visible,
  onClose,
  selectedLedgerCategory,
  ledgerCategoryCounts,
  onSelectCategory,
  insetsTop,
  allowedCategories,
}: EntityListCategoryModalProps) {
  const { t } = useLanguage();
  const categories = allowedCategories
    ? CATEGORY_KEYS.filter((c) => allowedCategories.includes(c.key))
    : CATEGORY_KEYS;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View
          style={[styles.entityListBackdrop, { paddingTop: insetsTop + 80 }]}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.entityListPanel}>
              <View style={styles.entityListPanelHeader}>
                <Text style={styles.entityListPanelTitle}>
                  {t("filterByCategory")}
                </Text>
              </View>
              <ScrollView
                style={styles.entityListCategoriesScroll}
                contentContainerStyle={styles.entityListCategories}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                {categories.map(({ key, labelKey, icon }) => {
                  const label = t(labelKey);
                  const isSelected = selectedLedgerCategory === key;
                  const count = ledgerCategoryCounts[key];
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.entityCategoryCard,
                        isSelected && styles.entityCategoryCardActive,
                      ]}
                      onPress={() => {
                        onSelectCategory(key);
                        onClose();
                      }}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.entityCategoryIconWrap,
                          isSelected && styles.entityCategoryIconWrapActive,
                        ]}
                      >
                        <FontAwesome
                          name={icon}
                          size={18}
                          color={
                            isSelected ? Theme.textOnDark : Theme.textMuted
                          }
                        />
                      </View>
                      <Text
                        style={[
                          styles.entityCategoryLabel,
                          isSelected && styles.entityCategoryLabelActive,
                        ]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      <Text
                        style={[
                          styles.entityCategoryCount,
                          isSelected && styles.entityCategoryCountActive,
                        ]}
                      >
                        {count}
                      </Text>
                      {isSelected && (
                        <FontAwesome
                          name="check-circle"
                          size={16}
                          color={Theme.darkGreen}
                          style={styles.entityCategoryCheck}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={styles.entityListBackdropTouchable} />
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
