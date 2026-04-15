import React from 'react';
import { StyleSheet, View } from 'react-native';
import Theme from '@/constants/Theme';
import { LeafletMap, type LeafletLatLng, type LeafletMarker } from '@/components/driver/LeafletMap.web';
import { getOptimalRoute } from '@/features/trips/services/routing.service';

interface OptimalRouteMapProps {
  from: any;
  to: any;
  onRouteFetched?: (route: any) => void;
}

export const OptimalRouteMap: React.FC<OptimalRouteMapProps> = ({ from, to, onRouteFetched }) => {
  const [polyline, setPolyline] = React.useState<LeafletLatLng[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    if (!from || !to || from.latitude == null || to.latitude == null) {
      setPolyline([]);
      return;
    }
    getOptimalRoute(from, to)
      .then((route) => {
        if (cancelled) return;
        const coords = (route?.coordinates ?? [])
          .filter((p) => p?.latitude != null && p?.longitude != null)
          .map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
        if (coords.length >= 2) {
          setPolyline(coords);
        } else {
          setPolyline([from, to]);
        }
        onRouteFetched?.(route ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setPolyline([from, to]);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, onRouteFetched]);

  const markers = React.useMemo<LeafletMarker[]>(() => {
    const next: LeafletMarker[] = [];
    if (from?.latitude != null && from?.longitude != null) {
      next.push({ id: 'from', coordinate: from, label: 'From', color: '#ef4444' });
    }
    if (to?.latitude != null && to?.longitude != null) {
      next.push({ id: 'to', coordinate: to, label: 'To', color: '#10b981' });
    }
    return next;
  }, [from, to]);

  const center = React.useMemo<LeafletLatLng>(() => {
    if (from?.latitude != null && from?.longitude != null) return from;
    if (to?.latitude != null && to?.longitude != null) return to;
    return { latitude: 20.5937, longitude: 78.9629 };
  }, [from, to]);

  return (
    <View style={styles.container}>
      <LeafletMap
        style={StyleSheet.absoluteFill}
        center={center}
        zoom={11}
        markers={markers}
        polyline={polyline}
        polylineColor={Theme.primary}
      />
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
});
