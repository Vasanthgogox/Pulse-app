import { LoadingIndicator } from "@/components/LoadingIndicator";
import { LeafletMap } from "@/components/driver/LeafletMap.web";
import { buildStaticMapImageUrl } from "@/features/chat/utils/staticMapUrl.util";
import type { OfficeMapCoordinate } from "@/features/network/hooks/useOrganizationOfficeMap";
import { networkDesktopHubStyles as styles } from "@/features/network/components/desktop/networkDesktopHub.styles";
import Theme from "@/constants/Theme";
import { MapPin } from "lucide-react-native";
import { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

type Props = {
  orgName: string;
  addressLabel: string;
  coordinate: OfficeMapCoordinate | null;
  loading?: boolean;
};

export function NetworkDesktopHeadquarterMap({
  orgName,
  addressLabel,
  coordinate,
  loading = false,
}: Props) {
  const staticMapUrl = useMemo(() => {
    if (!coordinate) return null;
    return buildStaticMapImageUrl(
      coordinate.latitude,
      coordinate.longitude,
      640,
      280,
    );
  }, [coordinate]);

  const markers = useMemo(
    () =>
      coordinate
        ? [
            {
              id: "headquarter",
              coordinate,
              label: orgName,
              color: "#50CD89",
            },
          ]
        : [],
    [coordinate, orgName],
  );

  if (loading) {
    return (
      <View style={[styles.mapPlaceholder, styles.mapPlaceholderLoading]}>
        <LoadingIndicator color={Theme.primary} size="small" />
      </View>
    );
  }

  if (!coordinate) {
    return (
      <View style={styles.mapPlaceholder}>
        <View style={styles.mapPinBubble}>
          <Text style={styles.mapPinBubbleText}>
            Registered office · {orgName}
          </Text>
          <Text style={styles.mapPinBubbleSub} numberOfLines={2}>
            {addressLabel}
          </Text>
        </View>
        <MapPin size={32} color="#50CD89" strokeWidth={2} />
      </View>
    );
  }

  return (
    <View style={styles.mapFrame}>
      {staticMapUrl ? (
        <Image
          source={{ uri: staticMapUrl }}
          style={styles.mapStaticImage}
          resizeMode="cover"
          accessibilityLabel={`Map showing ${orgName} headquarters`}
        />
      ) : (
        <LeafletMap
          style={StyleSheet.absoluteFill}
          center={coordinate}
          zoom={14}
          markers={markers}
          showZoomControls={false}
          interactionLocked
        />
      )}
      <View style={styles.mapPinBubble} pointerEvents="none">
        <Text style={styles.mapPinBubbleText}>
          Registered office · {orgName}
        </Text>
        <Text style={styles.mapPinBubbleSub} numberOfLines={2}>
          {addressLabel}
        </Text>
      </View>
    </View>
  );
}
