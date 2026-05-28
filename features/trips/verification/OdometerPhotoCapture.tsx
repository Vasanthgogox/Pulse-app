import Theme from "@/constants/Theme";
import { OperationalButton } from "@/components/operational";
import { Image, StyleSheet, Text, View } from "react-native";

export function OdometerPhotoCapture({
  photoUri,
  busy,
  onCapture,
  onRetake,
}: {
  photoUri: string | null;
  busy?: boolean;
  onCapture: () => void;
  onRetake: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Odometer Photo</Text>
      <Text style={styles.sub}>Camera-first, optional, useful for reconciliation.</Text>
      {photoUri ? (
        <>
          <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
          <OperationalButton
            intent="utility"
            label="Retake photo"
            onPress={onRetake}
            disabled={busy}
          />
        </>
      ) : (
        <OperationalButton
          intent="utility"
          label="Capture odometer photo"
          onPress={onCapture}
          disabled={busy}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.border,
    padding: 12,
    gap: 8,
  },
  title: {
    fontSize: 14,
    color: Theme.text,
    fontWeight: "700",
  },
  sub: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
  preview: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    backgroundColor: Theme.whiteMuted,
  },
});
