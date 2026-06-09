/**
 * Connection sales — trip-level data table cross-filtered by intelligent filters.
 */
import {
  SalesTripLaneCell,
  SalesTripMarginCell,
  SalesTripMoneyCell,
  SalesTripPartyCell,
  SalesTripRefCell,
  SalesTripStatusCell,
} from "@/features/network/components/desktop/NetworkDesktopSalesTripTableCells";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  buildSalesTripTableRows,
  hasActiveCrossFilters,
  paginateRows,
  type SalesCrossFilters,
} from "@/features/network/utils/connectionSalesAnalytics.util";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  MoreVertical,
  Search,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

const PAGE_SIZES = [10, 20, 30] as const;

type Props = {
  connections: ConnectedOrg[];
  trips: TripRow[];
  filters: SalesCrossFilters;
};

export function NetworkDesktopConnectionSalesTripsTable({
  connections,
  trips,
  filters,
}: Props) {
  const [tablePage, setTablePage] = useState(1);
  const [rowsPerPage, setRowsPerPage] =
    useState<(typeof PAGE_SIZES)[number]>(10);
  const [tableSearch, setTableSearch] = useState("");

  useEffect(() => {
    setTablePage(1);
  }, [filters]);

  const tableRows = useMemo(
    () => buildSalesTripTableRows(connections, trips, filters, tableSearch),
    [connections, trips, filters, tableSearch],
  );
  const pagination = useMemo(
    () => paginateRows(tableRows, tablePage, rowsPerPage),
    [tableRows, tablePage, rowsPerPage],
  );
  const filtersActive = hasActiveCrossFilters(filters);

  return (
    <View style={[styles.salesCard, styles.salesTableCard]}>
      <View style={styles.salesTableTitleRow}>
        <View style={styles.salesTripTableTitleCol}>
          <Text style={styles.salesCardTitle}>Trips</Text>
          <Text style={styles.salesTripTableSub}>
            {filtersActive
              ? "Filtered by your intelligent selections"
              : "All connection trips in period"}
          </Text>
        </View>
        <Pressable style={styles.salesCardMenu}>
          <MoreVertical size={15} color={METRONIC.muted} />
        </Pressable>
      </View>

      <View style={styles.salesTableToolbar}>
        <View style={styles.salesTableSearch}>
          <Search size={14} color={METRONIC.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search trips, lanes, parties…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={(v) => {
              setTableSearch(v);
              setTablePage(1);
            }}
          />
        </View>
        <Pressable style={styles.salesColumnsBtn}>
          <LayoutGrid size={13} color={METRONIC.muted} />
          <Text style={styles.salesColumnsBtnText}>Columns</Text>
        </Pressable>
      </View>

      <View style={styles.salesTableScroll}>
        <View style={styles.salesTableHead}>
          <View style={styles.salesTripTableGrid}>
            <View style={styles.salesColCheck} />
            <Text style={[styles.salesTableHeadCell, styles.salesColTripRef]}>
              Trip
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesColLane]}>
              Lane
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesColTripClient]}>
              Client
            </Text>
            <Text
              style={[styles.salesTableHeadCell, styles.salesColTripSupplier]}
            >
              Supplier
            </Text>
            <Text
              style={[
                styles.salesTableHeadCell,
                styles.salesColRevenue,
                styles.salesGridNumHead,
              ]}
            >
              Sales
            </Text>
            <Text
              style={[
                styles.salesTableHeadCell,
                styles.salesColCost,
                styles.salesGridNumHead,
              ]}
            >
              Cost
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
            <Text style={[styles.salesTableHeadCell, styles.salesColLast]}>
              Date
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
              No trips match the current intelligent filters.
            </Text>
          </View>
        ) : (
          pagination.rows.map((row, idx) => (
            <View
              key={row.id}
              style={[
                styles.salesTableRow,
                idx === pagination.rows.length - 1 && styles.salesTableRowLast,
              ]}
            >
              <View style={styles.salesTripTableGrid}>
                <View style={styles.salesColCheck}>
                  <View style={styles.salesCheckBox} />
                </View>
                <View style={styles.salesColTripRef}>
                  <SalesTripRefCell row={row} />
                </View>
                <View style={styles.salesColLane}>
                  <SalesTripLaneCell row={row} />
                </View>
                <View style={styles.salesColTripClient}>
                  <SalesTripPartyCell name={row.clientName} />
                </View>
                <View style={styles.salesColTripSupplier}>
                  <SalesTripPartyCell name={row.supplierName} />
                </View>
                <View style={styles.salesColRevenue}>
                  <SalesTripMoneyCell value={row.sales} />
                </View>
                <View style={styles.salesColCost}>
                  <SalesTripMoneyCell value={row.cost} />
                </View>
                <View style={styles.salesColMargin}>
                  <SalesTripMarginCell row={row} />
                </View>
                <View style={styles.salesColLast}>
                  <Text style={styles.salesLastActiveText} numberOfLines={1}>
                    {row.dateLabel ?? "—"}
                  </Text>
                </View>
                <View style={styles.salesColStatus}>
                  <SalesTripStatusCell row={row} />
                </View>
                <Pressable style={styles.salesColMenu}>
                  <MoreVertical size={14} color={METRONIC.muted} />
                </Pressable>
              </View>
            </View>
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
