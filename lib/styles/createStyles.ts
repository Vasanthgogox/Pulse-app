import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";

type StyleValue = ViewStyle | TextStyle | ImageStyle;

/** Contextual typing keeps RN style literals (e.g. fontWeight) narrow in large sheets. */
export const view = (style: ViewStyle): ViewStyle => style;
/** Web-only CSS (grid, calc, etc.). */
export const webView = (style: object): ViewStyle => style as unknown as ViewStyle;
export const text = (style: TextStyle): TextStyle => style;
export const image = (style: ImageStyle): ImageStyle => style;
/** Column layout shared by table header Text and body View cells. */
export type ColumnStyle = Pick<
  ViewStyle,
  | "minWidth"
  | "maxWidth"
  | "width"
  | "flex"
  | "flexGrow"
  | "flexShrink"
  | "flexBasis"
  | "alignSelf"
  | "alignItems"
  | "justifyContent"
  | "marginTop"
  | "marginBottom"
  | "paddingRight"
  | "paddingLeft"
  | "flexDirection"
  | "gap"
>;
export const column = (style: ColumnStyle): ColumnStyle => style;

/**
 * Preserves per-key style inference from the input object.
 * RN's StyleSheet.create widens every key to ViewStyle | TextStyle | ImageStyle
 * when a sheet mixes view + text styles or web-only CSS — this helper avoids that.
 */
export function createStyles<const T>(styles: T): T {
  return StyleSheet.create(
    styles as StyleSheet.NamedStyles<T & Record<string, StyleValue>>,
  ) as T;
}
