import Theme from "@/constants/Theme";
import { Platform, StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";

import { ADD_TRIP_FORM } from "./addTripFormTokens";

export interface AddTripWebCurrencyFieldProps {
  label: string;
  value: string;
  onChange: (raw: string) => void;
  required?: boolean;
  placeholder?: string;
  errorMessage?: string | null;
  dense?: boolean;
}

/** Direct TextInput for desktop web — avoids SmartInput drawer / keypad on create-trip. */
export function AddTripWebCurrencyField({
  label,
  value,
  onChange,
  required,
  placeholder = "0",
  errorMessage,
  dense,
}: AddTripWebCurrencyFieldProps) {
  const webOutline = (
    Platform.OS === "web" ? { outlineStyle: "none" as const } : {}
  ) as TextStyle;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, dense && styles.labelDense]}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <View style={[styles.shell, errorMessage ? styles.shellError : null]}>
        <Text style={styles.prefix}>₹</Text>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(text.replace(/[^\d.]/g, ""))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder={placeholder}
          placeholderTextColor={Theme.placeholder}
          style={[styles.input, dense && styles.inputDense, webOutline]}
          accessibilityLabel={label}
        />
      </View>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  label: {
    fontSize: ADD_TRIP_FORM.labelSize,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMutedDemo,
    marginBottom: 8,
  },
  labelDense: {
    fontSize: 9,
    marginBottom: 6,
  },
  req: {
    color: Theme.destructive,
  },
  shell: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 12,
    backgroundColor: Theme.surfaceForm,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  shellError: {
    borderColor: Theme.destructive,
    backgroundColor: "#fef2f2",
  },
  prefix: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimary,
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimary,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
    minWidth: 0,
  },
  inputDense: {
    fontSize: 14,
    paddingVertical: 8,
  },
  error: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.destructive,
  },
});
