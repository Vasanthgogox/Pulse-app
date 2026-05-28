import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Theme from "@/constants/Theme";

export type PulseTableColumn = {
  key: string;
  label: string;
  flex?: number;
  width?: number;
  align?: "left" | "right";
  money?: boolean;
};

export type PulseTableRow = {
  id: string;
  cells: Record<string, string>;
  tone?: "healthy" | "warning" | "critical" | null;
  selected?: boolean;
};

type Props = {
  columns: PulseTableColumn[];
  rows: PulseTableRow[];
  onRowPress?: (id: string) => void;
  emptyMessage?: string;
};

function cellContainerStyle(col: PulseTableColumn): ViewStyle {
  if (col.width != null) {
    return {
      width: col.width,
      flexShrink: 0,
      flexGrow: 0,
    };
  }
  return {
    flex: col.flex ?? 1,
    minWidth: 0,
  };
}

function CellText({
  column,
  value,
  tone,
}: {
  column: PulseTableColumn;
  value: string;
  tone?: "positive" | "negative" | null;
}) {
  const alignRight = column.align === "right";
  return (
    <Text
      style={[
        styles.cellText,
        alignRight && styles.cellTextRight,
        column.money && styles.cellMoney,
        tone === "positive" && styles.positive,
        tone === "negative" && styles.negative,
      ]}
      numberOfLines={column.flex != null && column.flex >= 2 ? 2 : 1}
    >
      {value}
    </Text>
  );
}

export function PulseRankingTable({ columns, rows, onRowPress, emptyMessage }: Props) {
  if (rows.length === 0) {
    return emptyMessage ? <Text style={styles.empty}>{emptyMessage}</Text> : null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        {columns.map((col) => (
          <View
            key={col.key}
            style={[cellContainerStyle(col), alignWrap(col.align)]}
          >
            <Text style={[styles.headerText, col.align === "right" && styles.headerTextRight]}>
              {col.label}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((row) => {
        const content = (
          <>
            {columns.map((col) => {
              const raw = row.cells[col.key] ?? "—";
              const explicitTone =
                row.cells[`${col.key}Tone`] === "negative"
                  ? "negative"
                  : row.cells[`${col.key}Tone`] === "positive"
                    ? "positive"
                    : null;
              return (
                <View
                  key={col.key}
                  style={[cellContainerStyle(col), alignWrap(col.align)]}
                >
                  <CellText column={col} value={raw} tone={explicitTone} />
                </View>
              );
            })}
          </>
        );

        const rowStyle = [
          styles.dataRow,
          row.tone === "critical" && styles.toneCritical,
          row.tone === "warning" && styles.toneWarning,
          row.tone === "healthy" && styles.toneHealthy,
          row.selected && styles.rowSelected,
        ];

        if (onRowPress) {
          return (
            <Pressable
              key={row.id}
              onPress={() => onRowPress(row.id)}
              style={({ pressed }) => [...rowStyle, pressed && styles.rowPressed]}
            >
              {content}
            </Pressable>
          );
        }

        return (
          <View key={row.id} style={rowStyle}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

function alignWrap(align?: "left" | "right"): ViewStyle {
  return align === "right" ? { alignItems: "flex-end" } : { alignItems: "flex-start" };
}

/** Section label + table — consistent card interior layout */
export function PulseTableSection({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          {icon}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Theme.whiteMuted,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 6,
  },
  headerText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  headerTextRight: {
    textAlign: "right",
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.whiteMuted,
    marginBottom: 5,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowSelected: {
    borderColor: Theme.primary,
    backgroundColor: "#eef2ff",
  },
  toneHealthy: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  toneWarning: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  toneCritical: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
  },
  cellText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.text,
  },
  cellTextRight: {
    textAlign: "right",
  },
  cellMoney: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  positive: {
    color: "#047857",
  },
  negative: {
    color: Theme.teslaRed,
  },
  empty: {
    fontSize: 9,
    color: Theme.textMuted,
    paddingVertical: 8,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  sectionSubtitle: {
    fontSize: 9,
    color: Theme.textMuted,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
});
