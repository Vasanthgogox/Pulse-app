import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { ChevronDown, ChevronUp, MoreVertical } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { PulsePartyCell } from "@/features/business-pulse/components/PulsePartyCell";
import { PulseTablePagination } from "@/features/business-pulse/components/PulseTablePagination";
import { pulseTableStyles as tbl } from "@/features/business-pulse/components/pulseTableStyles";
import type { PulsePartyProfile } from "@/features/business-pulse/lib/pulsePartyAvatars.util";
import { pulsePartyForName } from "@/features/business-pulse/lib/pulsePartyAvatars.util";

export type PulseTableColumn = {
  key: string;
  label: string;
  flex?: number;
  width?: number;
  align?: "left" | "right";
  money?: boolean;
  sortable?: boolean;
};

export type PulseTableRow = {
  id: string;
  cells: Record<string, string>;
  party?: PulsePartyProfile;
  tone?: "healthy" | "warning" | "critical" | null;
  selected?: boolean;
};

type Props = {
  columns: PulseTableColumn[];
  rows: PulseTableRow[];
  onRowPress?: (id: string) => void;
  emptyMessage?: string;
  pageSize?: number;
  showPagination?: boolean;
};

function cellContainerStyle(col: PulseTableColumn): ViewStyle {
  if (col.width != null) {
    return { width: col.width, flexShrink: 0, flexGrow: 0 };
  }
  return { flex: col.flex ?? 1, minWidth: 0 };
}

function alignWrap(align?: "left" | "right"): ViewStyle {
  return align === "right" ? { alignItems: "flex-end" } : { alignItems: "flex-start" };
}

function primaryMeta(row: PulseTableRow, columns: PulseTableColumn[]): string | null {
  if (row.cells.nameMeta) return row.cells.nameMeta;
  const tripsCol = columns.find((c) => c.key === "trips");
  if (tripsCol && row.cells.trips) return `${row.cells.trips} trips`;
  return null;
}

function CellContent({
  column,
  row,
  columns,
}: {
  column: PulseTableColumn;
  row: PulseTableRow;
  columns: PulseTableColumn[];
}) {
  const raw = row.cells[column.key] ?? "—";
  const explicitTone =
    row.cells[`${column.key}Tone`] === "negative"
      ? "negative"
      : row.cells[`${column.key}Tone`] === "positive"
        ? "positive"
        : null;

  if (column.key === "name") {
    const meta = primaryMeta(row, columns);
    const displayName = raw !== "—" ? raw : row.id;
    const party: PulsePartyProfile =
      row.party ?? pulsePartyForName(displayName, "client");
    return <PulsePartyCell party={party} meta={meta} avatarSize={40} />;
  }

  return (
    <Text
      style={[
        tbl.cellText,
        column.align === "right" && tbl.cellTextRight,
        column.money && tbl.cellMoney,
        explicitTone === "positive" && tbl.positive,
        explicitTone === "negative" && tbl.negative,
      ]}
      numberOfLines={column.flex != null && column.flex >= 2 ? 2 : 1}
    >
      {raw}
    </Text>
  );
}

export function PulseRankingTable({
  columns,
  rows,
  onRowPress,
  emptyMessage,
  pageSize = 8,
  showPagination = true,
}: Props) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [rows.length]);

  const pagedRows = useMemo(() => {
    if (!showPagination || pageSize <= 0) return rows;
    const start = page * pageSize;
    return rows.slice(start, start + pageSize);
  }, [page, pageSize, rows, showPagination]);

  if (rows.length === 0) {
    return emptyMessage ? <Text style={tbl.empty}>{emptyMessage}</Text> : null;
  }

  return (
    <View style={tbl.shell}>
      <View style={tbl.headerRow}>
        {columns.map((col) => (
          <View
            key={col.key}
            style={[cellContainerStyle(col), alignWrap(col.align), tbl.headerCell]}
          >
            <Text style={[tbl.headerText, col.align === "right" && tbl.headerTextRight]}>
              {col.label}
            </Text>
            {col.sortable !== false && col.key !== "name" ? (
              <View style={{ gap: -4 }}>
                <ChevronUp size={10} color={Theme.textMuted} strokeWidth={2.5} />
                <ChevronDown size={10} color={Theme.textMuted} strokeWidth={2.5} />
              </View>
            ) : null}
          </View>
        ))}
        <View style={tbl.rowMenu} />
      </View>

      {pagedRows.map((row) => {
        const content = (
          <>
            {columns.map((col) => (
              <View
                key={col.key}
                style={[cellContainerStyle(col), alignWrap(col.align)]}
              >
                <CellContent column={col} row={row} columns={columns} />
              </View>
            ))}
            <View style={tbl.rowMenu}>
              <MoreVertical size={16} color={Theme.textMuted} strokeWidth={2} />
            </View>
          </>
        );

        const rowStyle = [
          tbl.dataRow,
          row.tone === "critical" && tbl.toneCritical,
          row.tone === "warning" && tbl.toneWarning,
          row.selected && tbl.dataRowSelected,
        ];

        if (onRowPress) {
          return (
            <Pressable
              key={row.id}
              onPress={() => onRowPress(row.id)}
              style={({ pressed }) => [...rowStyle, pressed && tbl.dataRowPressed]}
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

      {showPagination && pageSize > 0 && rows.length > pageSize ? (
        <PulseTablePagination
          page={page}
          pageSize={pageSize}
          total={rows.length}
          onPageChange={setPage}
        />
      ) : null}
    </View>
  );
}

/** @deprecated Use PulseDashboardCard + PulseRankingTable */
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
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 8 }}>
        {icon}
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#181C32" }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 12, color: Theme.textMuted }}>{subtitle}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
