import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DriverDashboard() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.placeholder}>
          <FontAwesome name="truck" size={60} color={Theme.primary} />
          <Text style={styles.title}>Driver Dashboard</Text>
          <Text style={styles.subtitle}>
            The driver dashboard with live tracking is currently optimized for mobile devices.
          </Text>
          <View style={styles.infoBox}>
            <FontAwesome name="info-circle" size={16} color={Theme.textMuted} />
            <Text style={styles.infoText}>
              Web support for live tracking is coming soon.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    backgroundColor: Theme.screenBackground,
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 24,
    justifyContent: 'center',
    minHeight: 400,
  },
  placeholder: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: Theme.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    width: '100%',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    padding: 16,
    width: '100%',
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  infoText: {
    marginLeft: 10,
    fontSize: 14,
    color: Theme.textMuted,
    flex: 1,
    minWidth: 0,
  },
});
