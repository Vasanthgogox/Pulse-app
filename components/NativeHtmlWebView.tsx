import Theme from "@/constants/Theme";
import React, { useEffect, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type WebViewProps = ComponentProps<
  typeof import("react-native-webview").WebView
>;

type NativeHtmlWebViewProps = {
  html?: string;
  uri?: string;
  style?: StyleProp<ViewStyle>;
  startInLoadingState?: WebViewProps["startInLoadingState"];
};

let WebViewComponent: React.ComponentType<WebViewProps> | null = null;
let webViewLoadPromise: Promise<void> | null = null;

function loadWebView(): Promise<void> {
  if (WebViewComponent) return Promise.resolve();
  if (!webViewLoadPromise) {
    webViewLoadPromise = import("react-native-webview").then((mod) => {
      WebViewComponent = mod.WebView;
    });
  }
  return webViewLoadPromise;
}

/** Native-only WebView wrapper (lazy, single import site). */
export function NativeHtmlWebView({
  html,
  uri,
  style,
  startInLoadingState,
}: NativeHtmlWebViewProps) {
  const [ready, setReady] = useState(() => WebViewComponent != null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    void loadWebView().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (Platform.OS === "web") return null;

  if (!ready || !WebViewComponent) {
    return (
      <View style={[styles.loading, style]}>
        <ActivityIndicator color={Theme.primary} />
      </View>
    );
  }

  const WebView = WebViewComponent;
  const source = html != null ? { html } : uri != null ? { uri } : { html: "" };

  return (
    <WebView
      originWhitelist={["*"]}
      source={source}
      style={style}
      showsVerticalScrollIndicator
      nestedScrollEnabled
      startInLoadingState={startInLoadingState}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
});
