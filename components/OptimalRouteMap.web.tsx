import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import Theme from '@/constants/Theme';

interface OptimalRouteMapProps {
  from: any;
  to: any;
  onRouteFetched?: (route: any) => void;
}

export const OptimalRouteMap: React.FC<OptimalRouteMapProps> = () => {
  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <FontAwesome name="map-o" size={40} color={Theme.textMuted} />
        <Text style={styles.placeholderText}>
          Map view is not supported on web yet.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: Theme.surface,
    minHeight: 200,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 14,
    color: Theme.textMuted,
    textAlign: 'center',
  },
});
