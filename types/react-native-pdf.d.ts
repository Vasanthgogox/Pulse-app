declare module "react-native-pdf" {
  import type { ComponentType } from "react";
  import type { StyleProp, ViewStyle } from "react-native";

  export interface PdfProps {
    source: { uri: string; cache?: boolean };
    style?: StyleProp<ViewStyle>;
    onLoadComplete?: (numberOfPages: number, filePath: string) => void;
    onPageChanged?: (page: number, numberOfPages: number) => void;
    onError?: (error: unknown) => void;
  }

  const Pdf: ComponentType<PdfProps>;
  export default Pdf;
}
