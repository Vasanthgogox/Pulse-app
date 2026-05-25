import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { darkMapStyle } from '@/lib/mapStyles';
import { DriverGuidanceConfig } from '@/types/driver';
import type { RouteResult } from '@/lib/routingService';

export type TripStopCoord = { latitude: number; longitude: number };

interface DriverMapViewProps {
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  pickupCoord: TripStopCoord | null;
  dropCoord: TripStopCoord | null;
  /** Driver's latest GPS point to render "you are here" marker */
  currentLocation: TripStopCoord | null;
  /** Highlight pickup or drop pin to match guidance target */
  highlightTarget: 'pickup' | 'drop' | null;
  route: RouteResult | null;
  guidance: DriverGuidanceConfig | null;
  /** Map tiles + userInterfaceStyle: use DriverTheme map setting (auto/light/dark), not only app theme. */
  mapStyleDark: boolean;
  mapRef: React.RefObject<MapView | null>;
  onToggleFullMap: () => void;
  onFocusLocation: () => void;
  isFullMap?: boolean;
  /** Bottom padding so route stays above sheet (px) */
  mapPadding?: number;
  colors: {
    surface: string;
    border: string;
    text: string;
    textMuted: string;
    emerald: string;
    emeraldMuted: string;
  };
}

export const DriverMapView: React.FC<DriverMapViewProps> = ({
  region,
  pickupCoord,
  dropCoord,
  currentLocation,
  highlightTarget,
  route,
  guidance,
  mapStyleDark,
  mapRef,
  onToggleFullMap,
  onFocusLocation,
  isFullMap = false,
  mapPadding = 0,
  colors,
}) => {
  const insets = useSafeAreaInsets();
  // Keep map controls pinned to a stable top-right slot (requested), independent of route/card changes.
  // Using insets.top + some padding to ensure it's below the header in all views
  const controlsTop = isFullMap ? insets.top + 60 : insets.top + 60;

  const fitTrip = useCallback(() => {
    if (!mapRef.current || !pickupCoord || !dropCoord) return;
    mapRef.current.fitToCoordinates([pickupCoord, dropCoord], {
      edgePadding: { top: 80, right: 44, bottom: mapPadding + 40, left: 44 },
      animated: false,
    });
  }, [mapRef, pickupCoord, dropCoord, mapPadding]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        userInterfaceStyle={mapStyleDark ? 'dark' : 'light'}
        customMapStyle={mapStyleDark ? (darkMapStyle as any) : undefined}
        showsUserLocation
        rotateEnabled={false}
        mapPadding={{ top: 0, left: 0, right: 0, bottom: mapPadding }}
        onMapReady={fitTrip}
      >
        {pickupCoord ? (
          <Marker coordinate={pickupCoord} anchor={{ x: 0.5, y: 0.5 }}>
            <View
              style={[
                styles.markerPickup,
                highlightTarget === 'pickup' && styles.markerPickupActive,
              ]}
            >
              <FontAwesome name="map-marker" size={highlightTarget === 'pickup' ? 14 : 12} color="white" />
            </View>
          </Marker>
        ) : null}
        {dropCoord ? (
          <Marker coordinate={dropCoord} anchor={{ x: 0.5, y: 0.5 }}>
            <View
              style={[
                styles.markerDrop,
                highlightTarget === 'drop' && styles.markerDropActive,
              ]}
            >
              <FontAwesome name="flag" size={highlightTarget === 'drop' ? 12 : 10} color="white" />
            </View>
          </Marker>
        ) : null}
        {route && route.coordinates.length >= 2 ? (
          <>
            <Polyline
              coordinates={route.coordinates}
              strokeColor={`${Theme.primary}33`}
              strokeWidth={8}
              lineCap="round"
            />
            <Polyline
              coordinates={route.coordinates}
              strokeColor={Theme.primary}
              strokeWidth={4}
              lineCap="round"
            />
          </>
        ) : null}
      </MapView>

      {guidance ? (
        <View
          style={[
            styles.guidanceChip,
            isFullMap ? { top: insets.top + 12, left: 12, right: 72 } : { top: 12, left: 12, right: 72 },
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.guidanceHeader}>
            <View style={[styles.iconWrap, { backgroundColor: colors.emeraldMuted }]}>
              <FontAwesome name={guidance.icon} size={14} color={colors.emerald} />
            </View>
            <Text style={[styles.guidanceTitle, { color: colors.text }]} numberOfLines={1}>
              {guidance.title}
            </Text>
          </View>
          <Text style={[styles.guidanceSubtitle, { color: colors.textMuted }]} numberOfLines={2}>
            {guidance.subtitle}
          </Text>
        </View>
      ) : null}

      <View style={[styles.controls, { top: controlsTop }]}>
        <TouchableOpacity
          onPress={onToggleFullMap}
          style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <FontAwesome name={isFullMap ? 'compress' : 'expand'} size={16} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onFocusLocation}
          style={[
            styles.controlBtn,
            styles.locationControlBtn,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Current location"
          accessibilityHint="Centers map on your live location"
        >
          <View style={[styles.locationIconHalo, { backgroundColor: colors.emeraldMuted }]}>
            <FontAwesome name="location-arrow" size={15} color={colors.emerald} />
          </View>
          <View style={[styles.locationLiveDot, { backgroundColor: colors.emerald }]} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  markerPickup: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.positive,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  markerPickupActive: {
    transform: [{ scale: 1.08 }],
  },
  markerDrop: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.negative,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  markerDropActive: {
    transform: [{ scale: 1.08 }],
  },
  guidanceChip: {
    position: 'absolute',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  guidanceHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  guidanceTitle: { fontSize: 14, fontWeight: 'bold', flex: 1 },
  guidanceSubtitle: { fontSize: 12 },
  controls: { position: 'absolute', right: 16 },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    elevation: 4,
  },
  locationControlBtn: {
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 6,
  },
  locationIconHalo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationLiveDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});
