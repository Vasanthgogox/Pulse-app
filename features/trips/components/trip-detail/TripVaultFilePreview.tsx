import { PdfViewer } from "@/components/PdfViewer";
import {
  Image,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type Props = {
  uri: string;
  isPdf: boolean;
  style?: StyleProp<ViewStyle | ImageStyle>;
  accessibilityLabel?: string;
};

/** Renders an uploaded vault file: PDF via PdfViewer, images via Image. */
export function TripVaultFilePreview({
  uri,
  isPdf,
  style,
  accessibilityLabel,
}: Props) {
  if (isPdf) {
    return (
      <View style={style as StyleProp<ViewStyle>}>
        <PdfViewer pdfUri={uri} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style as StyleProp<ImageStyle>}
      resizeMode="contain"
      accessibilityLabel={accessibilityLabel}
    />
  );
}
