/**
 * Add Trip — client dropdown + optional free-text field.
 * Uses Theme by default; pass themeOverrides (e.g. from Ops Agent REF) to match dark UI.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { Text, TextInput, TouchableOpacity, View, StyleSheet} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import type { ClientRow } from '@/features/clients/services/clients.service';

/** Optional theme overrides so dropdown matches host UI (e.g. Ops Agent dark theme). */
export interface ClientDropdownThemeOverrides {
  borderColor: string;
  triggerTextColor: string;
  triggerPlaceholderColor: string;
  clearTextColor: string;
  chevronColor: string;
  pickerListBg: string;
  pickerListBorder: string;
  pickerItemBorder: string;
  pickerItemTextColor: string;
  pickerItemActiveBg: string;
  hintColor: string;
  placeholderColor: string;
  loaderColor: string;
}

export interface ClientDropdownProps {
  clients: ClientRow[];
  loading: boolean;
  selectedId: string | null;
  clientName: string;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onSelectClient: (client: ClientRow) => void;
  onClearSelection: () => void;
  onClientNameChange: (name: string) => void;
  inputStyle: object;
  labelStyle: object;
  /** When set (e.g. Ops Agent), dropdown uses these colors instead of Theme for consistent dark/light UI. */
  themeOverrides?: ClientDropdownThemeOverrides;
}

export function ClientDropdown({
  clients,
  loading,
  selectedId,
  clientName,
  pickerOpen,
  onTogglePicker,
  onSelectClient,
  onClearSelection,
  onClientNameChange,
  inputStyle,
  labelStyle,
  themeOverrides,
}: ClientDropdownProps) {
  const T = themeOverrides ?? {
    borderColor: Theme.borderMedium,
    triggerTextColor: Theme.textPrimary,
    triggerPlaceholderColor: Theme.placeholder,
    clearTextColor: Theme.textSecondary,
    chevronColor: Theme.textMuted,
    pickerListBg: Theme.surface,
    pickerListBorder: Theme.border,
    pickerItemBorder: Theme.surfaceBorder,
    pickerItemTextColor: Theme.textPrimary,
    pickerItemActiveBg: Theme.positiveMuted,
    hintColor: Theme.textSecondary,
    placeholderColor: Theme.placeholder,
    loaderColor: Theme.primary,
  };
  return (
    <>
      <Text style={labelStyle}>Client *</Text>
      {loading ? (
        <View style={styles.loaderRow}>
          <LoadingIndicator size="small" color={T.loaderColor} />
        </View>
      ) : clients.length > 0 ? (
        <>
          <TouchableOpacity
            style={[styles.input, styles.clientTrigger, { borderColor: T.borderColor }]}
            onPress={onTogglePicker}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.clientTriggerText, { color: clientName ? T.triggerTextColor : T.triggerPlaceholderColor }]}
              numberOfLines={1}
            >
              {clientName || 'Select client'}
            </Text>
            <View style={styles.clientTriggerRight}>
              {selectedId ? (
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onClearSelection}>
                  <Text style={[styles.clearText, { color: T.clearTextColor }]}>Clear</Text>
                </TouchableOpacity>
              ) : null}
              <FontAwesome name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={14} color={T.chevronColor} />
            </View>
          </TouchableOpacity>
          {pickerOpen && (
            <View style={[styles.pickerList, { backgroundColor: T.pickerListBg, borderColor: T.pickerListBorder }]}>
              {clients.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.pickerItem,
                    { borderBottomColor: T.pickerItemBorder },
                    selectedId === c.id && { backgroundColor: T.pickerItemActiveBg },
                  ]}
                  onPress={() => onSelectClient(c)}
                >
                  <Text style={[styles.pickerItemText, { color: T.pickerItemTextColor }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={[styles.hint, { color: T.hintColor }]}>Or type client name below</Text>
        </>
      ) : (
        <Text style={[styles.hint, { color: T.hintColor }]}>
          No clients yet. Type name below or add clients first.
        </Text>
      )}
      <TextInput
        style={inputStyle}
        placeholder={clients.length > 0 ? 'Or type a different client name' : 'Client name'}
        placeholderTextColor={T.placeholderColor}
        value={clientName}
        onChangeText={onClientNameChange}
        autoCapitalize="words"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
      />
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
    marginBottom: 16,
  },
  loaderRow: {
    marginBottom: 16,
    minHeight: 48,
    justifyContent: 'center',
  },
  clientTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clientTriggerText: {
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  clientTriggerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearText: {
    fontSize: 14,
  },
  pickerList: {
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 180,
  },
  pickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  pickerItemText: {
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    marginBottom: 6,
  },
});
