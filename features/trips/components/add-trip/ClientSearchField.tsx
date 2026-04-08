/**
 * Add Trip — client dropdown: tap to open list, type to filter.
 * Dropdown is always in a Modal so the list scrolls reliably on both iOS and Android.
 * Includes "Create new client" at bottom (opens sub-modal).
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import type { ClientRow } from "@/features/clients/services/clients.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";

export interface ClientSearchFieldProps {
  clients: ClientRow[];
  loading: boolean;
  selectedId: string | null;
  clientName: string;
  onSelectClient: (client: ClientRow) => void;
  onClearSelection: () => void;
  onClientNameChange: (name: string) => void;
  /** Called when user taps "Create new client". Omit or set showCreateClientOption=false to show only created clients. */
  onRequestCreateClient?: () => void;
  /** When false, only the list of created clients is shown (no "Create new client" row). Default true. */
  showCreateClientOption?: boolean;
  /** When provided, called when dropdown opens/closes so parent can e.g. disable scroll */
  onDropdownOpenChange?: (open: boolean) => void;
  inputStyle: object;
  labelStyle: object;
}

export function ClientSearchField({
  clients,
  loading,
  selectedId,
  clientName,
  onSelectClient,
  onClearSelection,
  onClientNameChange,
  onRequestCreateClient,
  showCreateClientOption = true,
  onDropdownOpenChange,
  inputStyle,
  labelStyle,
}: ClientSearchFieldProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapperRef = useRef<View>(null);

  const hasSelectedClient = !!selectedId;
  const query = hasSelectedClient ? "" : clientName.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      query
        ? clients.filter((c) => c.name.toLowerCase().includes(query))
        : clients,
    [clients, query],
  );

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    onDropdownOpenChange?.(false);
  }, [onDropdownOpenChange]);

  const openDropdown = useCallback(() => {
    setDropdownOpen(true);
    onDropdownOpenChange?.(true);
  }, [onDropdownOpenChange]);

  const handleSelectClient = (c: ClientRow) => {
    onSelectClient(c);
    closeDropdown();
  };

  const handleCreatePress = () => {
    closeDropdown();
    onRequestCreateClient?.();
  };

  const dropdownListContent = (
    <>
      {filtered.length === 0 && (
        <View style={styles.emptyListWrap}>
          <Text style={styles.emptyListText}>
            {query
              ? "No matching client."
              : "No clients yet. Add clients from the Clients page first."}
          </Text>
        </View>
      )}
      {filtered.slice(0, 50).map((c) => (
        <TouchableOpacity
          key={c.id}
          style={[
            styles.listItem,
            selectedId === c.id && styles.listItemActive,
          ]}
          onPress={() => handleSelectClient(c)}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.listItemText, { color: Theme.textPrimary }]}
            numberOfLines={1}
          >
            {c.name}
          </Text>
        </TouchableOpacity>
      ))}
      {showCreateClientOption && (
        <TouchableOpacity
          style={styles.createRow}
          onPress={handleCreatePress}
          activeOpacity={0.7}
        >
          <FontAwesome name="plus" size={14} color={Theme.primary} />
          <Text style={[styles.createRowText, { color: Theme.primary }]}>
            {clientName.trim()
              ? `Create "${clientName.trim()}"`
              : "Create new client"}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );

  return (
    <View ref={wrapperRef} style={styles.wrapper} collapsable={false}>
      <Text style={labelStyle}>Client *</Text>
      {loading ? (
        <View style={styles.loaderRow}>
          <ActivityIndicator size="small" color={Theme.primary} />
        </View>
      ) : null}
      <View style={styles.inputRow}>
        {hasSelectedClient ? (
          <TouchableOpacity
            style={[styles.input, inputStyle, styles.readonlyInput]}
            onPress={() => {
              if (dropdownOpen) {
                closeDropdown();
              } else {
                openDropdown();
              }
            }}
            activeOpacity={0.7}
          >
            <Text
              style={styles.readonlyInputText}
              numberOfLines={1}
            >
              {clientName}
            </Text>
          </TouchableOpacity>
        ) : (
          <TextInput
            style={[styles.input, inputStyle]}
            placeholder={
              showCreateClientOption
                ? "Select client or add new"
                : "Select client"
            }
            placeholderTextColor={Theme.placeholder}
            value={clientName}
            onChangeText={onClientNameChange}
            onFocus={openDropdown}
            onBlur={() => setTimeout(closeDropdown, 180)}
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />
        )}
        {selectedId ? (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={onClearSelection}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FontAwesome
              name="times-circle"
              size={20}
              color={Theme.textMuted}
            />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.chevronBtn}
            onPress={() => {
              if (dropdownOpen) {
                closeDropdown();
              } else {
                openDropdown();
              }
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FontAwesome
              name={dropdownOpen ? "chevron-up" : "chevron-down"}
              size={14}
              color={Theme.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
      {!loading && dropdownOpen && (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={closeDropdown}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <View
              style={styles.dropdownModalCard}
              onStartShouldSetResponder={() => true}
            >
              <Text style={styles.dropdownModalTitle}>Select client</Text>
              <ScrollView
                style={styles.dropdownScroll}
                contentContainerStyle={styles.dropdownScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                bounces
              >
                {dropdownListContent}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    zIndex: 1,
    marginBottom: 16,
  },
  loaderRow: {
    marginBottom: 8,
    minHeight: 40,
    justifyContent: "center",
  },
  inputRow: {
    position: "relative",
    marginBottom: 4,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
    paddingRight: 44,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  readonlyInput: {
    justifyContent: "center",
  },
  readonlyInputText: {
    fontSize: 16,
    color: Theme.textPrimary,
  },
  clearBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  chevronBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  dropdownModalCard: {
    alignSelf: "stretch",
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    maxHeight: 340,
    overflow: "hidden",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  dropdownModalTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Layout.headerPaddingBelowInset - 2,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  dropdownScroll: {
    maxHeight: 260,
  },
  dropdownScrollContent: {
    paddingVertical: 8,
    paddingBottom: Layout.screenPaddingHorizontal,
  },
  listItem: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  listItemActive: {
    backgroundColor: Theme.positiveMuted,
  },
  listItemText: {
    fontSize: 15,
    fontWeight: "600",
  },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
  },
  createRowText: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.primary,
  },
  emptyListWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 14,
  },
  emptyListText: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
});
