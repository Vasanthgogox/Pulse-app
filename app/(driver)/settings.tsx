import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import Typography from '@/constants/Typography';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useAuth } from '@/contexts/AuthContext';

export default function DriverSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useDriverThemeColors();

  const goToProfile = () => router.replace('/(driver)/profile');
  const { theme, setTheme, mapTheme, setMapTheme } = useDriverTheme();
  const { signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/sign-in');
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: 0,
          paddingHorizontal: Layout.screenPaddingHorizontal,
          paddingBottom: insets.bottom + 80,
        },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            setTimeout(() => setRefreshing(false), 400);
          }}
          tintColor={colors.emerald}
        />
      }
    >
      <View style={[styles.header, { paddingTop: insets.top + Layout.driverHeaderTopOffset, backgroundColor: colors.surface }]}>
        <TouchableOpacity
          onPress={goToProfile}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
          accessibilityLabel="Back to profile"
        >
          <FontAwesome name="chevron-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Appearance</Text>
        <View style={[styles.themeRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Theme</Text>
          <View style={[styles.themeToggle, { backgroundColor: colors.whiteMuted, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.themeToggleHalf, theme === 'light' && { backgroundColor: colors.emerald }]}
              onPress={() => setTheme('light')}
              activeOpacity={0.8}
              accessibilityLabel="Light theme"
              accessibilityState={{ selected: theme === 'light' }}
            >
              <FontAwesome name="sun-o" size={18} color={theme === 'light' ? colors.textOnPrimary : colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.themeToggleHalf, theme === 'dark' && { backgroundColor: colors.emerald }]}
              onPress={() => setTheme('dark')}
              activeOpacity={0.8}
              accessibilityLabel="Dark theme"
              accessibilityState={{ selected: theme === 'dark' }}
            >
              <FontAwesome name="moon-o" size={18} color={theme === 'dark' ? colors.textOnPrimary : colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.themeRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Map Style</Text>
          <View style={[styles.mapThemeToggle, { backgroundColor: colors.whiteMuted, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.mapToggleThird, mapTheme === 'light' && { backgroundColor: colors.emerald }]}
              onPress={() => setMapTheme('light')}
              activeOpacity={0.8}
              accessibilityLabel="Light Map"
            >
              <FontAwesome name="sun-o" size={14} color={mapTheme === 'light' ? colors.textOnPrimary : colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mapToggleThird, mapTheme === 'auto' && { backgroundColor: colors.emerald }]}
              onPress={() => setMapTheme('auto')}
              activeOpacity={0.8}
              accessibilityLabel="Auto Map"
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: mapTheme === 'auto' ? colors.textOnPrimary : colors.textMuted }}>Auto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mapToggleThird, mapTheme === 'dark' && { backgroundColor: colors.emerald }]}
              onPress={() => setMapTheme('dark')}
              activeOpacity={0.8}
              accessibilityLabel="Dark Map"
            >
              <FontAwesome name="moon-o" size={14} color={mapTheme === 'dark' ? colors.textOnPrimary : colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>About</Text>
        <View style={[styles.row, { borderTopColor: colors.border }]}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>App</Text>
          <Text style={[styles.rowValue, { color: colors.textMuted }]}>Q Pilot</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.signOutBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={handleSignOut}
        activeOpacity={0.8}
      >
        <FontAwesome name="sign-out" size={20} color={Theme.negative} />
        <Text style={[styles.signOutText, { color: Theme.negative }]}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.driverHeaderHorizontalPadding,
    paddingBottom: Layout.driverHeaderBottomPadding,
    marginBottom: 24,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    ...Typography.headerTitle,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  themeToggle: {
    flexDirection: 'row',
    width: 88,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'stretch',
  },
  themeToggleHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapThemeToggle: {
    flexDirection: 'row',
    width: 130,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'stretch',
  },
  mapToggleThird: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
