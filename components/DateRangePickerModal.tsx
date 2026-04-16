/**
 * DateRangePickerModal — compact bottom-sheet style modal for picking a from/to
 * date range. Used by list screens (e.g. Trips) to filter by a custom date range.
 *
 * Uses `@react-native-community/datetimepicker` on native and a plain
 * `<input type="date">` fallback on web. Apply/Clear buttons at the bottom.
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface DateRangePickerModalProps {
  visible: boolean;
  initialFrom?: string | null;
  initialTo?: string | null;
  onDismiss: () => void;
  onApply: (from: string, to: string) => void;
  onClear?: () => void;
}

function toIsoDate(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDisplay(iso: string): string {
  const d = parseIso(iso);
  if (!d) return "—";
  return d
    .toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}

export function DateRangePickerModal({
  visible,
  initialFrom,
  initialTo,
  onDismiss,
  onApply,
  onClear,
}: DateRangePickerModalProps) {
  const insets = useSafeAreaInsets();
  const [from, setFrom] = useState<string>(initialFrom ?? "");
  const [to, setTo] = useState<string>(initialTo ?? "");
  const [activeField, setActiveField] = useState<"from" | "to" | null>(null);

  useEffect(() => {
    if (visible) {
      setFrom(initialFrom ?? "");
      setTo(initialTo ?? "");
      setActiveField(null);
    }
  }, [visible, initialFrom, initialTo]);

  const canApply = Boolean(from && to) && new Date(from) <= new Date(to);

  const renderNativePicker = () => {
    if (!activeField) return null;
    const base = activeField === "from" ? parseIso(from) : parseIso(to);
    const value = base ?? new Date();
    if (Platform.OS === "android") {
      return (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          onChange={(e, d) => {
            const field = activeField;
            setActiveField(null);
            if (e.type === "set" && d) {
              const iso = toIsoDate(d);
              if (field === "from") setFrom(iso);
              else setTo(iso);
            }
          }}
        />
      );
    }
    return (
      <View style={styles.iosPickerWrap}>
        <DateTimePicker
          value={value}
          mode="date"
          display="spinner"
          onChange={(_, d) => {
            if (d) {
              const iso = toIsoDate(d);
              if (activeField === "from") setFrom(iso);
              else setTo(iso);
            }
          }}
        />
        <TouchableOpacity
          style={styles.iosPickerDoneBtn}
          onPress={() => setActiveField(null)}
          activeOpacity={0.85}
        >
          <Text style={styles.iosPickerDoneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderWebInput = (field: "from" | "to") => {
    const value = field === "from" ? from : to;
    const onChange = field === "from" ? setFrom : setTo;
    return (
      // @ts-ignore - web-only native input
      <input
        type="date"
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        style={webInputStyle}
      />
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.sheet,
                { paddingBottom: Math.max(insets.bottom + 16, 20) },
              ]}
            >
              <View style={styles.handle} />

              <View style={styles.header}>
                <View style={styles.headerIconChip}>
                  <FontAwesome name="calendar" size={12} color={Theme.textOnDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>DATE RANGE</Text>
                  <Text style={styles.subtitle}>Pick a custom window</Text>
                </View>
                <TouchableOpacity
                  onPress={onDismiss}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="times" size={14} color={Theme.textOnDarkMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>FROM</Text>
                  {Platform.OS === "web" ? (
                    renderWebInput("from")
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.fieldBtn,
                        activeField === "from" && styles.fieldBtnActive,
                      ]}
                      onPress={() =>
                        setActiveField(activeField === "from" ? null : "from")
                      }
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.fieldValue,
                          !from && styles.fieldValuePlaceholder,
                        ]}
                      >
                        {from ? formatDisplay(from) : "Select"}
                      </Text>
                      <FontAwesome
                        name="calendar"
                        size={10}
                        color={Theme.textOnDarkMuted}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.fieldDivider}>
                  <FontAwesome
                    name="arrow-right"
                    size={10}
                    color={Theme.textOnDarkMuted}
                  />
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>TO</Text>
                  {Platform.OS === "web" ? (
                    renderWebInput("to")
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.fieldBtn,
                        activeField === "to" && styles.fieldBtnActive,
                      ]}
                      onPress={() =>
                        setActiveField(activeField === "to" ? null : "to")
                      }
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.fieldValue,
                          !to && styles.fieldValuePlaceholder,
                        ]}
                      >
                        {to ? formatDisplay(to) : "Select"}
                      </Text>
                      <FontAwesome
                        name="calendar"
                        size={10}
                        color={Theme.textOnDarkMuted}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {Platform.OS !== "web" && activeField ? renderNativePicker() : null}

              <View style={styles.actions}>
                {onClear ? (
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => {
                      setFrom("");
                      setTo("");
                      onClear();
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.clearBtnText}>CLEAR</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.applyBtn, !canApply && styles.applyBtnDisabled]}
                  onPress={() => {
                    if (!canApply) return;
                    onApply(from, to);
                  }}
                  disabled={!canApply}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      styles.applyBtnText,
                      !canApply && styles.applyBtnTextDisabled,
                    ]}
                  >
                    APPLY RANGE
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const webInputStyle: any = {
  backgroundColor: "rgba(255,255,255,0.06)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 700,
  width: "100%",
  outline: "none",
  fontFamily: "inherit",
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Theme.darkBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: Theme.teslaRed,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 18,
  },
  headerIconChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  title: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textOnDark,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  fieldBlock: {
    flex: 1,
  },
  fieldDivider: {
    paddingBottom: 14,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  fieldBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  fieldBtnActive: {
    borderColor: Theme.teslaRed,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  fieldValue: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.6,
  },
  fieldValuePlaceholder: {
    color: Theme.textOnDarkMuted,
    fontWeight: "600",
  },
  iosPickerWrap: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    paddingBottom: 8,
  },
  iosPickerDoneBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  iosPickerDoneBtnText: {
    color: Theme.teslaRed,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.6,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
  },
  clearBtn: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    letterSpacing: 1.4,
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.teslaRed,
  },
  applyBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  applyBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1.6,
  },
  applyBtnTextDisabled: {
    color: Theme.textOnDarkMuted,
  },
});
