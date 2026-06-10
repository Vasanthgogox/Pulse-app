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

const PAGE_SIZES = [10, 20, 30] as const;

type Props = {
  connections: ConnectedOrg[];
  trips: TripRow[];
  baseFilters: SalesCrossFilters;
  onOpenProfile: (item: ConnectedOrg) => void;
  title?: string;
  companyName?: string;
  dateRangeLabel?: string;
};

export function NetworkDesktopPartnersPerformanceTable({
  connections,
  trips,
  baseFilters,
  onOpenProfile,
  title = "Partners",
  companyName = "Your workspace",
  dateRangeLabel = "All time",
}: Props) {
  const [tablePage, setTablePage] = useState(1);
  const [rowsPerPage, setRowsPerPage] =
    useState<(typeof PAGE_SIZES)[number]>(10);
  const [tableSearch, setTableSearch] = useState("");
  const [onlyWithTrips, setOnlyWithTrips] = useState(baseFilters.onlyWithTrips);

  const mergedFilters = useMemo(
    (): SalesCrossFilters => ({
      ...baseFilters,
      search: tableSearch,
      onlyWithTrips,
    }),
    [baseFilters, tableSearch, onlyWithTrips],
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
        <View style={styles.salesTableHead}>
          <View style={styles.salesTableGrid}>
            <View style={styles.salesColCheck} />
            <Text style={[styles.salesTableHeadCell, styles.salesColPartner]}>
              Partner
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesColRating]}>
              Rating
            </Text>
            <Text
              style={[
                styles.salesTableHeadCell,
                styles.salesColTrips,
                styles.salesGridNumHead,
              ]}
            >
              Trips
            </Text>
            <Text
              style={[
                styles.salesTableHeadCell,
                styles.salesColRevenue,
                styles.salesGridNumHead,
              ]}
            >
              Sales / cost
            </Text>
            <Text
              style={[
                styles.salesTableHeadCell,
                styles.salesColMargin,
                styles.salesGridNumHead,
              ]}
            >
              Margin
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesColRegion]}>
              Top lane
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesColLast]}>
              Last active
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesColStatus]}>
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
                styles.salesTableRow,
                idx === pagination.rows.length - 1 && styles.salesTableRowLast,
              ]}
              onPress={() => onOpenProfile(row.connection)}
            >
              <View style={styles.salesTableGrid}>
                <View style={styles.salesColCheck}>
                  <View style={styles.salesCheckBox} />
                </View>
                <View style={styles.salesColPartner}>
                  <SalesTablePartnerCell row={row} />
                </View>
                <View style={styles.salesColRating}>
                  <SalesTableRatingCell row={row} />
                </View>
                <View style={styles.salesColTrips}>
                  <SalesTableTripsCell row={row} />
                </View>
                <View style={styles.salesColRevenue}>
                  <SalesTableRevenueCell row={row} />
                </View>
                <View style={styles.salesColMargin}>
                  <SalesTableMarginCell row={row} />
                </View>
                <View style={styles.salesColRegion}>
                  <Text style={styles.salesLaneText} numberOfLines={1}>
                    {row.topLane}
                  </Text>
                </View>
                <View style={styles.salesColLast}>
                  <Text style={styles.salesLastActiveText} numberOfLines={1}>
                    {row.lastTripLabel ?? "—"}
                  </Text>
                </View>
                <View style={styles.salesColStatus}>
                  <View
                    style={[
                      styles.statusPill,
                      row.isIntegrated
                        ? styles.salesStatusLive
                        : styles.salesStatusInvite,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        row.isIntegrated
                          ? styles.salesStatusLiveText
                          : styles.salesStatusInviteText,
                      ]}
                    >
                      {row.isIntegrated ? "Live" : "Invite"}
                    </Text>
                  </View>
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
          {PAGE_SIZES.map((size) => (
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
          <Text style={styles.salesPageRange}>
            {pagination.from} – {pagination.to} of {tableRows.length}
          </Text>
          <Pressable
            disabled={tablePage <= 1}
            onPress={() => setTablePage((p) => Math.max(1, p - 1))}
            style={[
              styles.salesPageBtn,
              tablePage <= 1 && styles.salesPageBtnDisabled,
            ]}
          >
            <ChevronLeft size={16} color={METRONIC.subtle} />
          </Pressable>
          {Array.from({ length: pagination.totalPages }).map((_, i) => {
            const page = i + 1;
            if (
              pagination.totalPages > 5 &&
              page !== 1 &&
              page !== pagination.totalPages &&
              Math.abs(page - tablePage) > 1
            ) {
              return null;
            }
            return (
              <Pressable
                key={page}
                onPress={() => setTablePage(page)}
                style={[
                  styles.salesPageNum,
                  tablePage === page && styles.salesPageNumOn,
                ]}
              >
                <Text
                  style={[
                    styles.salesPageNumText,
                    tablePage === page && styles.salesPageNumTextOn,
                  ]}
                >
                  {page}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            disabled={tablePage >= pagination.totalPages}
            onPress={() =>
              setTablePage((p) => Math.min(pagination.totalPages, p + 1))
            }
            style={[
              styles.salesPageBtn,
              tablePage >= pagination.totalPages && styles.salesPageBtnDisabled,
            ]}
          >
            <ChevronRight size={16} color={METRONIC.subtle} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
