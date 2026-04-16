import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Theme from '@/constants/Theme';

interface PdfViewerProps {
  pdfUri: string | null;
}

export function PdfViewer({ pdfUri }: PdfViewerProps) {
  if (!pdfUri) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>No PDF available for preview.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Browsers have built-in PDF viewers, so an iframe is suitable for web */}
      <iframe
        src={pdfUri}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="PDF Preview"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surface,
  },
  message: {
    color: Theme.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
});
