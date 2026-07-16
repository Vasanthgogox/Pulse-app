/**
 * react-native-web adds pointer hover handlers to View that are absent from the
 * base react-native ViewProps typings. Declaring them here keeps web-only hover
 * containers (e.g. mirror toggles) type-safe without runtime changes.
 */
import "react-native";

declare module "react-native" {
  interface ViewProps {
    onHoverIn?: (() => void) | undefined;
    onHoverOut?: (() => void) | undefined;
  }
}
