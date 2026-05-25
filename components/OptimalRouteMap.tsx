import React, { useEffect, useState, useRef } from 'react';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { StyleSheet, View, Text, Platform} from 'react-native';
import { LeafletMap } from '@/components/driver/LeafletMap';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type MapViewRef,
} from '@/lib/reactNativeMapsCompat';
import { FontAwesome } from '@expo/vector-icons';
import { getOptimalRoute, LatLon, RouteResult } from '@/lib/routingService';
import Theme from '@/constants/Theme';
import { useDriverTheme } from '@/contexts/DriverThemeContext';
import { darkMapStyle } from '@/lib/mapStyles';

interface OptimalRouteMapProps {
  from: LatLon;
  to: LatLon;
  onRouteFetched?: (route: RouteResult) => void;
}

/**
 * A specialized Map component that fetches and displays an optimal road route.
 * Elevates the UI with custom markers and a high-quality polyline.
 */
export const OptimalRouteMap: React.FC<OptimalRouteMapProps> = ({
  from,
  to,
  onRouteFetched,
}) => {
  const { isDark: themeIsDark, mapTheme } = useDriverTheme();
  const isDark = mapTheme === 'auto' ? themeIsDark : mapTheme === 'dark';

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<MapViewRef | null>(null);

  useEffect(() => {
    async function fetchRoute() {
      setLoading(true);
      const result = await getOptimalRoute(from, to);
      if (result) {
        setRoute(result);
        onRouteFetched?.(result);
        
        // Auto-fit the route after a short delay to ensure map is ready
        setTimeout(() => {
          if (Platform.OS !== 'web') {
            mapRef.current?.fitToCoordinates(result.coordinates, {
              edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
              animated: true,
            });
          }
        }, 500);
      }
      setLoading(false);
    }

    fetchRoute();
  }, [from.latitude, from.longitude, to.latitude, to.longitude]);

  const mapCenter = {
    latitude: (from.latitude + to.latitude) / 2,
    longitude: (from.longitude + to.longitude) / 2,
  };

  if (Platform.OS === 'web') {
    const leafletMarkers = [
      {
        id: 'start',
        coordinate: from,
        label: 'Pickup',
        color: Theme.positive,
      },
      {
        id: 'end',
        coordinate: to,
        label: 'Drop-off',
        color: Theme.teslaRed,
      },
    ];

    return (
      <View style={styles.container}>
        <LeafletMap
          center={mapCenter}
          zoom={12}
          markers={leafletMarkers}
          polyline={route?.coordinates || []}
          polylineColor={Theme.primary}
          style={styles.map}
        />
        {loading && (
          <View style={styles.loadingOverlay}>
            <LoadingIndicator size="large" color={Theme.primary} />
            <Text style={styles.loadingText}>Calculating optimal route...</Text>
          </View>
        )}
        {route && !loading && (
          <View style={[styles.statsCard, { backgroundColor: isDark ? Theme.darkSurface : Theme.surface }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: isDark ? Theme.textOnDarkMuted : Theme.textMuted }]}>Distance</Text>
              <Text style={[styles.statValue, { color: isDark ? Theme.textOnDark : Theme.textPrimary }]}>
                {(route.distance / 1000).toFixed(1)} km
              </Text>
            </View>
            <View style={styles.statSeparator} />
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: isDark ? Theme.textOnDarkMuted : Theme.textMuted }]}>Duration</Text>
              <Text style={[styles.statValue, { color: isDark ? Theme.textOnDark : Theme.textPrimary }]}>
                {Math.round(route.duration / 60)} mins
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        initialRegion={{
          ...mapCenter,
          latitudeDelta: Math.abs(from.latitude - to.latitude) * 2,
          longitudeDelta: Math.abs(from.longitude - to.longitude) * 2,
        }}
        customMapStyle={isDark ? (darkMapStyle as any) : undefined}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
      >
        {/* Start Marker (Pickup) */}
        <Marker coordinate={from} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.markerContainer, { backgroundColor: Theme.positive }]}>
            <View style={styles.markerInner}>
              <FontAwesome name="map-marker" size={14} color="white" />
            </View>
          </View>
        </Marker>

        {/* End Marker (Drop-off) */}
        <Marker coordinate={to} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.markerContainer, { backgroundColor: Theme.teslaRed }]}>
            <View style={styles.markerInner}>
              <FontAwesome name="flag" size={12} color="white" />
            </View>
          </View>
        </Marker>

        {/* The Route Line */}
        {route && (
          <Polyline
            coordinates={route.coordinates}
            strokeWidth={4}
            strokeColor={Theme.primary}
            lineCap="round"
            lineJoin="round"
            // Elevated UI: adding a slight transparency or using gradient on iOS
            // For cross-platform consistency, we use a solid high-contrast color
          />
        )}

        {/* Optional: Glow effect for the route (Android doesn't support Polyline gradients well) */}
        {route && (
          <Polyline
            coordinates={route.coordinates}
            strokeWidth={8}
            strokeColor={`${Theme.primary}33`} // 20% opacity for glow
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <LoadingIndicator size="large" color={Theme.primary} />
          <Text style={styles.loadingText}>Calculating optimal route...</Text>
        </View>
      )}

      {route && !loading && (
        <View style={[styles.statsCard, { backgroundColor: isDark ? Theme.darkSurface : Theme.surface }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: isDark ? Theme.textOnDarkMuted : Theme.textMuted }]}>Distance</Text>
            <Text style={[styles.statValue, { color: isDark ? Theme.textOnDark : Theme.textPrimary }]}>
              {(route.distance / 1000).toFixed(1)} km
            </Text>
          </View>
          <View style={styles.statSeparator} />
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: isDark ? Theme.textOnDarkMuted : Theme.textMuted }]}>Duration</Text>
            <Text style={[styles.statValue, { color: isDark ? Theme.textOnDark : Theme.textPrimary }]}>
              {Math.round(route.duration / 60)} mins
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 16,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  markerContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 2,
    borderColor: 'white',
  },
  markerInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: Theme.primary,
  },
  statsCard: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statSeparator: {
    width: 1,
    height: '60%',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
});
