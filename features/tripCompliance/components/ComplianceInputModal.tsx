/**
 * Cross-platform replacement for `Alert.prompt` (iOS-only in React Native —
 * a no-op on Android/web, which this app also runs on). Small, generic,
 * multi-field text-input modal used by ComplianceSection's verify/reject,
 * hard-copy-POD, and advance/balance payment actions.
 */
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Theme from "@/constants/Theme";

export type ComplianceInputField = {
  key: string;
  label: string;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
  required?: boolean;
};

type Props = {
  visible: boolean;
  title: string;
  fields: ComplianceInputField[];
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
};

export function ComplianceInputModal({
  visible,
  title,
  fields,
  confirmLabel = "Confirm",
  onCancel,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) setValues({});
  }, [visible]);

  const missingRequired = fields.some((f) => f.required && !(values[f.key] ?? "").trim());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {fields.map((f) => (
            <View key={f.key} style={styles.fieldWrap}>
              <Text style={styles.label}>{f.label}</Text>
              <TextInput
                style={styles.input}
                placeholder={f.placeholder}
                keyboardType={f.keyboardType ?? "default"}
                value={values[f.key] ?? ""}
                onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))}
              />
            </View>
          ))}
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, missingRequired && styles.confirmBtnDisabled]}
              disabled={missingRequired}
              onPress={() => onSubmit(values)}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  sheet: { width: "88%", maxWidth: 420, backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, gap: 10 },
  title: { fontSize: 15, fontWeight: "700", color: Theme.textPrimary, marginBottom: 4 },
  fieldWrap: { gap: 4 },
  label: { fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  input: {
    borderWidth: 1,
    borderColor: "#D7D9E0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: Theme.textPrimary,
  },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  cancelText: { fontSize: 13, color: Theme.textMuted, fontWeight: "600" },
  confirmBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: "#111827" },
  confirmBtnDisabled: { backgroundColor: "#C7CAD1" },
  confirmText: { fontSize: 13, color: "#FFFFFF", fontWeight: "700" },
});
