/**
 * Compact date field for client profile forms — native calendar on web,
 * DateTimePicker sheet/dialog on iOS/Android.
 */
import {
  METRONIC,
} from "@/features/clients/components/desktop/clientProfileHub.styles";
import { profileHubLayoutStyles as mobile } from "@/features/party/components/profileHubLayout.styles";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { createElement, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`);
  }
  return new Date();
}

function formatDisplay(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const d = parseISO(value);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type Props = {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  compact?: boolean;
  /** Stretch to full grid cell width (EmbeddedLanes uses no compact flag). */
  fullWidth?: boolean;
};

export function ClientProfileDateField({
  label,
  value,
  onChange,
  required,
  compact,
  fullWidth,
}: Props) {
  const [open, setOpen] = useState(false);
  const isoValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

  return (
    <View style={[s.field, compact && mobile.fieldGroupFull, fullWidth && s.fieldGrow]}>
      <Text style={s.label}>
        {label}
        {required ? <Text style={s.req}> *</Text> : null}
      </Text>

      {Platform.OS === "web" ? (
        <View style={s.webShell}>
          {createElement("input", {
            type: "date",
            value: isoValue,
            "aria-label": label,
            onChange: (e: { target: { value: string } }) => {
              onChange(e.target.value ?? "");
            },
            style: {
              width: "100%",
              boxSizing: "border-box",
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: "500",
              color: METRONIC.text,
              fontFamily: "inherit",
              padding: 0,
              margin: 0,
              minHeight: 20,
              cursor: "pointer",
            },
          })}
          <Calendar size={14} color={METRONIC.subtle} strokeWidth={2.2} />
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => setOpen(true)}
            style={({ pressed }) => [s.webShell, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Text style={[s.valueText, !isoValue && s.placeholder]}>
              {isoValue ? formatDisplay(isoValue) : "Pick date"}
            </Text>
            <Calendar size={14} color={METRONIC.subtle} strokeWidth={2.2} />
          </Pressable>

          {open && Platform.OS === "android" ? (
            <DateTimePicker
              value={parseISO(isoValue)}
              mode="date"
              display="default"
              onChange={(e, date) => {
                setOpen(false);
                if (e.type === "set" && date) onChange(toISODate(date));
              }}
            />
          ) : null}

          {Platform.OS === "ios" ? (
            <Modal visible={open} transparent animationType="slide">
              <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
                <View style={s.sheet} onStartShouldSetResponder={() => true}>
                  <View style={s.sheetHeader}>
                    <Pressable onPress={() => { onChange(""); setOpen(false); }} hitSlop={10}>
                      <Text style={s.clearText}>Clear</Text>
                    </Pressable>
                    <Text style={s.sheetTitle}>{label}</Text>
                    <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                      <Text style={s.doneText}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={parseISO(isoValue)}
                    mode="date"
                    display="spinner"
                    onChange={(_, date) => date && onChange(toISODate(date))}
                  />
                </View>
              </Pressable>
            </Modal>
          ) : null}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  field: {
    width: "31%",
    minWidth: 140,
    flexGrow: 1,
    gap: 4,
  },
  fieldGrow: {
    flexGrow: 1,
  },
  label: {
    fontSize: 9,
    fontWeight: "800",
    color: METRONIC.muted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  req: { color: "#F1416C" },
  webShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
  },
  valueText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: METRONIC.text,
  },
  placeholder: {
    color: METRONIC.muted,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
  },
  sheetTitle: { fontSize: 14, fontWeight: "700", color: METRONIC.text },
  doneText: { fontSize: 14, fontWeight: "700", color: METRONIC.link },
  clearText: { fontSize: 14, fontWeight: "600", color: METRONIC.muted },
});
