import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { NativeHtmlWebView } from "@/components/NativeHtmlWebView";
import Theme from "@/constants/Theme";

interface PdfViewerProps {
  pdfUri: string | null;
}

/**
 * Native PDF preview via WebView (Expo Go–compatible; no react-native-pdf).
 * Supports file:// URIs from expo-print and https:// URLs.
 */
export function PdfViewer({ pdfUri }: PdfViewerProps) {
  if (!pdfUri) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>No PDF available for preview.</Text>
      </View>
    );
  }

  const isHtml =
    pdfUri.trim().startsWith("<") || pdfUri.includes("<!DOCTYPE");

  return (
    <View style={styles.container}>
      <NativeHtmlWebView
        html={isHtml ? pdfUri : undefined}
        uri={isHtml ? undefined : pdfUri}
        style={styles.pdf}
        startInLoadingState
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  message: {
    color: Theme.textSecondary,
    fontSize: 16,
    textAlign: "center",
  },
  pdf: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: Theme.surface,
  },
});
