import Theme from "@/constants/Theme";
import { assignmentShellStyles } from "@/features/trips/styles/assignmentShellShared";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

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
};

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
}: AssignmentEntityPickerProps) {
  return (
    <View style={assignmentShellStyles.assignPickerCard}>
      <View style={assignmentShellStyles.assignPickerHeader}>
        <Text style={assignmentShellStyles.assignPickerTitle}>{title}</Text>
        <View style={styles.headerRight}>
          {headerActionLabel && onHeaderAction ? (
            <TouchableOpacity
              onPress={onHeaderAction}
              activeOpacity={0.85}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.headerActionText}>{headerActionLabel}</Text>
            </TouchableOpacity>
          ) : null}
          <View style={assignmentShellStyles.assignPickerBadge}>
            <Text style={assignmentShellStyles.assignPickerBadgeText}>
              {totalCount} Total
            </Text>
          </View>
        </View>
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
              <FontAwesome name="plus" size={12} color={Theme.textOnDark} />
              <Text style={assignmentShellStyles.assignEmptyActionBtnText}>
                {emptyActionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        items.map((item) => {
          const selected = selectedId === item.id;
          const disabled = item.disabled === true;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                assignmentShellStyles.assignEntityRow,
                selected && assignmentShellStyles.assignEntityRowActive,
                disabled && assignmentShellStyles.assignEntityRowDisabled,
              ]}
              onPress={() => {
                if (disabled) return;
                onSelect(item.id);
              }}
              disabled={disabled}
              activeOpacity={0.85}
            >
              <View style={assignmentShellStyles.assignEntityIconWrap}>
                <FontAwesome
                  name={
                    icon === "truck"
                      ? "truck"
                      : icon === "building"
                        ? "building"
                        : "user"
                  }
                  size={16}
                  color={selected ? Theme.primary : Theme.textMuted}
                />
              </View>
              <View style={assignmentShellStyles.assignEntityTextCol}>
                <Text style={assignmentShellStyles.assignEntityTitle} numberOfLines={1}>
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
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActionText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});
