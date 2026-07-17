import type { ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  FlatList,
  Platform,
  type ListRenderItem,
} from 'react-native';
import { useLayoutInsets } from '@/lib/layoutInsets';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';

interface ListScreenLayoutPropsBase {
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onFilterPress?: () => void;
  onExportPress?: () => void;
  summaryCard?: ReactNode;
  fab?: ReactNode;
  /** Inline action rendered at the right end of the search/filter row (e.g. "Add" pill). Replaces FAB on screens that prefer toolbar-anchored actions. */
  headerAction?: ReactNode;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}

interface ListScreenLayoutPropsWithChildren extends ListScreenLayoutPropsBase {
  /** Use ScrollView and render children (non-virtualized). */
  children: ReactNode;
  listData?: never;
  renderListItem?: never;
  listKeyExtractor?: never;
  ListEmptyComponent?: never;
}

interface ListScreenLayoutPropsWithFlatList<T> extends ListScreenLayoutPropsBase {
  /** Virtualized list: FlatList with data + renderItem. Omit children. */
  listData: readonly T[];
  renderListItem: ListRenderItem<T>;
  listKeyExtractor: (item: T) => string;
  /** Shown when listData.length === 0 (e.g. "No customers yet."). */
  ListEmptyComponent?: React.ReactElement | null;
  children?: never;
}

export type ListScreenLayoutProps<T = unknown> =
  | ListScreenLayoutPropsWithChildren
  | (ListScreenLayoutPropsWithFlatList<T> & { children?: never });

export function ListScreenLayout<T = unknown>(props: ListScreenLayoutProps<T>) {
  const {
    title,
    subtitle,
    searchPlaceholder = 'Search',
    searchValue = '',
    onSearchChange,
    onFilterPress,
    onExportPress,
    summaryCard,
    fab,
    headerAction,
    onRefresh,
    refreshing = false,
  } = props;

  const layout = useLayoutInsets();
  const bottomPadding = layout.scrollBottomPadding(24);
  const isFlatList =
    'listData' in props &&
    props.listData != null &&
    'renderListItem' in props &&
    'listKeyExtractor' in props;

  const refreshControl = onRefresh ? (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.primary} />
  ) : undefined;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: layout.top + 16 }]}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle != null && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>

      {summaryCard != null && <View style={styles.summaryWrap}>{summaryCard}</View>}

      <View style={styles.toolbar}>
        <View style={styles.searchRow}>
          <FontAwesome name="search" size={18} color={Theme.iconMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor={Theme.textMuted}
            value={searchValue}
            onChangeText={onSearchChange}
            editable={!!onSearchChange}
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
        </View>
        {onFilterPress && (
          <TouchableOpacity style={styles.iconBtn} onPress={onFilterPress}>
            <FontAwesome name="sliders" size={20} color={Theme.iconSlate} />
          </TouchableOpacity>
        )}
        {onExportPress && (
          <TouchableOpacity style={styles.exportBtn} onPress={onExportPress}>
            <Text style={styles.exportText}>PDF</Text>
          </TouchableOpacity>
        )}
        {headerAction != null ? (
          <View style={styles.headerActionSlot}>{headerAction}</View>
        ) : null}
      </View>

      {isFlatList ? (
        <FlatList
          data={props.listData as T[]}
          renderItem={props.renderListItem}
          keyExtractor={props.listKeyExtractor}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          ListEmptyComponent={props.ListEmptyComponent}
        />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {'children' in props ? props.children : null}
        </ScrollView>
      )}

      {fab != null && fab}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    backgroundColor: Theme.screenBackground,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 7,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  summaryWrap: {
    marginTop: -4,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.surfaceForm,
    borderRadius: 4,
    paddingHorizontal: 12,
    borderWidth: 0,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimary,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as object,
    }),
  },
  iconBtn: {
    padding: 8,
  },
  exportBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    borderRadius: 4,
  },
  exportText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
  },
  headerActionSlot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
});
