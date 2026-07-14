import Theme from "@/constants/Theme";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Plus } from "lucide-react-native";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

export type AssignmentEntityItem = {
  id: string;
  title: string;
  subtitle?: string;
  disabled?: boolean;
};

export type AssignmentEntityPickerProps = {
  title: string;
  totalCount: number;
  items: AssignmentEntityItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  icon?: "user" | "truck" | "building";
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  headerActionLabel?: string;
  onHeaderAction?: () => void;
  /** Subtle card border when step validation failed (no outer red wrapper). */
  errorOutline?: boolean;
};

const LIST_MAX_HEIGHT = 300;

export function AssignmentEntityPicker({
  title,
  totalCount,
  items,
  selectedId,
  onSelect,
  icon = "user",
  emptyMessage,
  emptyActionLabel,
  onEmptyAction,
  headerActionLabel,
  onHeaderAction,
  errorOutline = false,
}: AssignmentEntityPickerProps) {
  const webCursor =
    Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

  const iconName =
    icon === "truck" ? "truck" : icon === "building" ? "building" : "user";

  return (
    <View
      style={[
        assignmentShellStyles.assignPickerCard,
        errorOutline && assignmentShellStyles.assignPickerCardError,
      ]}
    >
      <View style={assignmentShellStyles.assignPickerHeader}>
        <View style={assignmentShellStyles.assignPickerHeaderTop}>
          <Text style={assignmentShellStyles.assignPickerTitle} numberOfLines={2}>
            {title}
          </Text>
          <View style={assignmentShellStyles.assignPickerCountBadge}>
            <Text style={assignmentShellStyles.assignPickerCountText}>
              {totalCount}
            </Text>
          </View>
        </View>
        {headerActionLabel && onHeaderAction ? (
          <Pressable
            onPress={onHeaderAction}
            style={({ pressed }) => [
              assignmentShellStyles.assignPickerHeaderAction,
              pressed && assignmentShellStyles.assignPickerHeaderActionPressed,
              webCursor,
            ]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={headerActionLabel}
          >
            <Plus size={14} color={Theme.primary} strokeWidth={2.5} />
            <Text style={assignmentShellStyles.assignPickerHeaderActionText}>
              {headerActionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {items.length === 0 ? (
        <View style={assignmentShellStyles.assignEmptyState}>
          {emptyMessage ? (
            <Text style={assignmentShellStyles.assignEmptyText}>{emptyMessage}</Text>
          ) : null}
          {emptyActionLabel && onEmptyAction ? (
            <TouchableOpacity
              style={assignmentShellStyles.assignEmptyActionBtn}
              onPress={onEmptyAction}
              activeOpacity={0.9}
            >
              <FontAwesome name="plus" size={12} color={Theme.buttonPrimaryText} />
              <Text style={assignmentShellStyles.assignEmptyActionBtnText}>
                {emptyActionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={assignmentShellStyles.assignEntityList}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {items.map((item, index) => {
            const selected = selectedId === item.id;
            const disabled = item.disabled === true;
            const isLast = index === items.length - 1;
            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  assignmentShellStyles.assignEntityRow,
                  selected && assignmentShellStyles.assignEntityRowActive,
                  disabled && assignmentShellStyles.assignEntityRowDisabled,
                  pressed && !disabled && assignmentShellStyles.assignEntityRowPressed,
                  isLast && styles.entityRowLast,
                  webCursor,
                ]}
                onPress={() => {
                  if (disabled) return;
                  onSelect(item.id);
                }}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
              >
                {selected ? (
                  <View style={assignmentShellStyles.assignEntityActiveBar} />
                ) : null}
                <View style={assignmentShellStyles.assignEntityIconWrap}>
                  <FontAwesome
                    name={iconName}
                    size={15}
                    color={selected ? Theme.primary : Theme.textMuted}
                  />
                </View>
                <View style={assignmentShellStyles.assignEntityTextCol}>
                  <Text
                    style={[
                      assignmentShellStyles.assignEntityTitle,
                      selected && assignmentShellStyles.assignEntityTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  {item.subtitle ? (
                    <Text
                      style={assignmentShellStyles.assignEntitySubtitle}
                      numberOfLines={1}
                    >
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>
                <FontAwesome
                  name={selected ? "check-circle" : "chevron-right"}
                  size={15}
                  color={selected ? Theme.primary : Theme.textMuted}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listScroll: {
    maxHeight: LIST_MAX_HEIGHT,
    width: "100%",
  },
  entityRowLast: {
    marginBottom: 0,
  },
});
