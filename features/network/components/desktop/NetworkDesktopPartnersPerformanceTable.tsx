/**
 * Partners performance table — client sales / supplier cost rollup per connection.
 */
import Theme from "@/constants/Theme";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import {
  SalesTableMarginCell,
  SalesTablePartnerCell,
  SalesTableRatingCell,
  SalesTableRevenueCell,
  SalesTableTripsCell,
} from "@/features/network/components/desktop/NetworkDesktopSalesTableCells";
import { NetworkExportMenu } from "@/features/network/components/desktop/NetworkExportMenu";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import {
  exportConnectionSalesExcel,
  exportConnectionSalesPdf,
} from "@/features/network/lib/networkExport.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  buildSalesTableRows,
  computeSalesKpis,
  paginateRows,
  type SalesCrossFilters,
} from "@/features/network/utils/connectionSalesAnalytics.util";
import {
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";

const PAGE_SIZES = [8, 10, 20, 30] as const;

type Props = {
  connections: ConnectedOrg[];
  trips: TripRow[];
  baseFilters: SalesCrossFilters;
  onOpenProfile: (item: ConnectedOrg) => void;
  /** Off-app / not-integrated partners — send Pulse invite. */
  onInvite?: (item: ConnectedOrg) => void;
  invitingId?: string | null;
  title?: string;
  companyName?: string;
  dateRangeLabel?: string;
  /** Compact typography aligned to the 2-row connections grid. */
  dense?: boolean;
};

export function NetworkDesktopPartnersPerformanceTable({
  connections,
  trips,
  baseFilters,
  onOpenProfile,
  onInvite,
  invitingId = null,
  title = "Partners",
  companyName = "Your workspace",
  dateRangeLabel = "All time",
  dense = false,
}: Props) {
  const [tablePage, setTablePage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<(typeof PAGE_SIZES)[number]>(
    dense ? 8 : 10,
  );
  const [tableSearch, setTableSearch] = useState("");
  const [onlyWithTrips, setOnlyWithTrips] = useState(baseFilters.onlyWithTrips);

  const mergedFilters = useMemo(
    (): SalesCrossFilters => ({
      ...baseFilters,
      // Connections grid already applies hub search — avoid double-filtering the page.
      search: dense ? tableSearch : tableSearch || baseFilters.search,
      onlyWithTrips,
    }),
    [baseFilters, tableSearch, onlyWithTrips, dense],
  );

  const tableRows = useMemo(
    () => buildSalesTableRows(connections, trips, mergedFilters),
    [connections, trips, mergedFilters],
  );
  const kpis = useMemo(
    () => computeSalesKpis(connections, trips, mergedFilters),
    [connections, trips, mergedFilters],
  );
  const pagination = useMemo(
    () => paginateRows(tableRows, tablePage, rowsPerPage),
    [tableRows, tablePage, rowsPerPage],
  );

  const gridStyle = dense
    ? styles.salesPartnersTableGridDense
    : styles.salesPartnersTableGrid;
  const headStyle = dense ? styles.salesTableHeadDense : styles.salesTableHead;
  const headCellStyle = dense
    ? styles.salesTableHeadCellDense
    : styles.salesTableHeadCell;

  return (
    <View style={[styles.salesCard, styles.salesTableCard, styles.connectionsPartnersTable]}>
      <View style={styles.salesTableTitleRow}>
        <Text style={styles.salesCardTitle}>{title}</Text>
        <NetworkExportMenu
          actions={[
            {
              label: "Export Excel",
              sublabel: "Partners, KPIs, margins",
              kind: "excel",
              onExport: () => exportConnectionSalesExcel(tableRows, kpis, companyName, dateRangeLabel),
            },
            {
              label: "Export PDF",
              sublabel: "Print-ready partner report",
              kind: "pdf",
              onExport: () => exportConnectionSalesPdf(tableRows, kpis, companyName, dateRangeLabel),
            },
          ]}
          triggerStyle={styles.salesCardMenu}
        />
      </View>

      <View style={styles.salesTableToolbar}>
        <View style={styles.salesTableSearch}>
          <Search size={14} color={METRONIC.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search partners…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={(v) => {
              setTableSearch(v);
              setTablePage(1);
            }}
          />
        </View>
        <View style={styles.salesTableToolbarMid}>
          <Text style={styles.salesToolbarLabel}>Only with trips</Text>
          <Switch
            value={onlyWithTrips}
            onValueChange={(v) => {
              setOnlyWithTrips(v);
              setTablePage(1);
            }}
            trackColor={{
              false: METRONIC.border,
              true: "rgba(62, 151, 255, 0.35)",
            }}
            thumbColor={onlyWithTrips ? METRONIC.link : Theme.cardWhite}
          />
        </View>
        <NetworkExportMenu
          actions={[
            {
              label: "Export Excel (.xlsx)",
              kind: "excel",
              onExport: () => exportConnectionSalesExcel(tableRows, kpis, companyName, dateRangeLabel),
            },
            {
              label: "Export PDF",
              kind: "pdf",
              onExport: () => exportConnectionSalesPdf(tableRows, kpis, companyName, dateRangeLabel),
            },
          ]}
          trigger={
            <View style={styles.salesColumnsBtn}>
              <Text style={styles.salesColumnsBtnText}>Export ↓</Text>
            </View>
          }
        />
      </View>

      <View style={styles.salesTableScroll}>
        <View style={headStyle}>
          <View style={gridStyle}>
            <View style={styles.salesColCheck} />
            <Text style={[headCellStyle, styles.salesColPartner]}>
              Partner
            </Text>
            <Text style={[headCellStyle, styles.salesColRating]}>
              Rating
            </Text>
            <Text
              style={[
                headCellStyle,
                styles.salesColTrips,
                styles.salesGridNumHead,
              ]}
            >
              Trips
            </Text>
            <Text
              style={[
                headCellStyle,
                styles.salesColRevenue,
                styles.salesGridNumHead,
              ]}
            >
              Sales / cost
            </Text>
            <Text
              style={[
                headCellStyle,
                styles.salesColMargin,
                styles.salesGridNumHead,
              ]}
            >
              Margin
            </Text>
            <Text style={[headCellStyle, styles.salesColLast]}>
              Last active
            </Text>
            <Text style={[headCellStyle, styles.salesColStatus]}>
              Status
            </Text>
            <View style={styles.salesColMenu} />
          </View>
        </View>

        {pagination.rows.length === 0 ? (
          <View style={styles.salesTableEmpty}>
            <Text style={styles.emptyText}>
              No partner performance data for current filters.
            </Text>
          </View>
        ) : (
          pagination.rows.map((row, idx) => (
            <Pressable
              key={row.id}
              style={[
                dense ? styles.salesTableRowDense : styles.salesTableRow,
                idx === pagination.rows.length - 1 && styles.salesTableRowLast,
              ]}
              onPress={() => onOpenProfile(row.connection)}
            >
              <View style={gridStyle}>
                <View style={styles.salesColCheck}>
                  <View style={styles.salesCheckBox} />
                </View>
                <View style={styles.salesColPartner}>
                  <SalesTablePartnerCell row={row} dense={dense} />
                </View>
                <View style={styles.salesColRating}>
                  <SalesTableRatingCell row={row} dense={dense} />
                </View>
                <View style={styles.salesColTrips}>
                  <SalesTableTripsCell row={row} dense={dense} />
                </View>
                <View style={styles.salesColRevenue}>
                  <SalesTableRevenueCell row={row} dense={dense} />
                </View>
                <View style={styles.salesColMargin}>
                  <SalesTableMarginCell row={row} dense={dense} />
                </View>
                <View style={styles.salesColLast}>
                  <Text
                    style={
                      dense
                        ? styles.salesLastActiveTextDense
                        : styles.salesLastActiveText
                    }
                    numberOfLines={1}
                  >
                    {row.lastTripLabel ?? "—"}
                  </Text>
                </View>
                <View style={styles.salesColStatus}>
                  {row.isIntegrated ? (
                    <View
                      style={[
                        dense ? styles.statusPillDense : styles.statusPill,
                        styles.salesStatusLive,
                      ]}
                    >
                      <Text
                        style={[
                          dense
                            ? styles.statusPillTextDense
                            : styles.statusPillText,
                          styles.salesStatusLiveText,
                        ]}
                      >
                        Live
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        onInvite?.(row.connection);
                      }}
                      disabled={
                        !onInvite || invitingId === row.connection.id
                      }
                      style={({ pressed }) => [
                        dense ? styles.statusPillDense : styles.statusPill,
                        styles.salesStatusInvite,
                        styles.salesInviteBtn,
                        pressed && styles.salesInviteBtnPressed,
                        (!onInvite || invitingId === row.connection.id) &&
                          styles.salesInviteBtnDisabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Send invite to ${row.connection.name}`}
                    >
                      <Text
                        style={[
                          dense
                            ? styles.statusPillTextDense
                            : styles.statusPillText,
                          styles.salesStatusInviteText,
                        ]}
                      >
                        {invitingId === row.connection.id
                          ? "Sending…"
                          : "Send invite"}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.salesColMenu} />
              </View>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.salesPagination}>
        <View style={styles.salesPageSizeRow}>
          <Text style={styles.salesPageSizeLabel}>Rows per page</Text>
          {(dense ? ([8, 10, 20] as const) : PAGE_SIZES).map((size) => (
            <Pressable
              key={size}
              onPress={() => {
                setRowsPerPage(size);
                setTablePage(1);
              }}
              style={[
                styles.salesPageSizeBtn,
                rowsPerPage === size && styles.salesPageSizeBtnOn,
              ]}
            >
              <Text
                style={[
                  styles.salesPageSizeBtnText,
                  rowsPerPage === size && styles.salesPageSizeBtnTextOn,
                ]}
              >
                {size}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.salesPageNav}>
          <Text style={styles.salesPageRange} numberOfLines={1}>
            {pagination.from}–{pagination.to} of {tableRows.length}
          </Text>
          <Pressable
            onPress={() => setTablePage((p) => Math.max(1, p - 1))}
            disabled={tablePage <= 1}
            style={[
              styles.salesPageBtn,
              tablePage <= 1 && styles.salesPageBtnDisabled,
            ]}
          >
            <ChevronLeft
              size={14}
              color={tablePage <= 1 ? METRONIC.muted : METRONIC.text}
            />
          </Pressable>
          <Pressable
            onPress={() =>
              setTablePage((p) => Math.min(pagination.totalPages, p + 1))
            }
            disabled={tablePage >= pagination.totalPages}
            style={[
              styles.salesPageBtn,
              tablePage >= pagination.totalPages && styles.salesPageBtnDisabled,
            ]}
          >
            <ChevronRight
              size={14}
              color={
                tablePage >= pagination.totalPages
                  ? METRONIC.muted
                  : METRONIC.text
              }
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
