import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';

export default function DriverDashboard() {
  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginTop: 24,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: Theme.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 400,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    padding: 16,
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  infoText: {
    marginLeft: 10,
    fontSize: 14,
    color: Theme.textMuted,
  },
});
