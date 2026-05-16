import Theme from "@/constants/Theme";
import * as React from "react";
import type { LedgerWebDateFieldProps } from "./LedgerWebDateField";

export function LedgerWebDateField({
  value,
  minimumDate,
  maximumDate,
  onChange,
  overlay = false,
}: LedgerWebDateFieldProps) {
  const isoValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

  return React.createElement("input", {
    type: "date",
    value: isoValue,
    min: minimumDate,
    max: maximumDate,
    "aria-label": "Pick sync date",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      if (next) onChange(next);
    },
    style: overlay
      ? {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: "pointer",
          zIndex: 2,
          border: "none",
          margin: 0,
          padding: 0,
        }
      : {
          width: "100%",
          boxSizing: "border-box",
          fontSize: 16,
          lineHeight: "22px",
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px solid ${Theme.borderMedium}`,
          backgroundColor: Theme.surface,
          color: Theme.textPrimaryDark,
          fontFamily: "inherit",
        },
  });
}
