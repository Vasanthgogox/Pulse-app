import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRef } from "react";
import { TextInput, TouchableOpacity, View } from "react-native";

import Theme from "@/constants/Theme";

import { hubMobileChromeStyles as styles } from "./hubMobileChrome";

export interface HubMobileSearchRowProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
}

export function HubMobileSearchRow({
  value,
  onChange,
  placeholder = "Search…",
  accessibilityLabel = "Search",
}: HubMobileSearchRowProps) {
  const inputRef = useRef<TextInput>(null);

  return (
    <View style={styles.searchRow}>
      <FontAwesome
        name="search"
        size={13}
        color={Theme.textMuted}
        style={styles.searchLeadingIcon}
      />
      <TextInput
        ref={inputRef}
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={Theme.textMuted}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={accessibilityLabel}
      />
      {value.length > 0 ? (
        <TouchableOpacity
          onPress={() => onChange("")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <FontAwesome name="times-circle" size={14} color={Theme.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
