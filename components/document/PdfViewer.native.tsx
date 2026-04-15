import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import Pdf from 'react-native-pdf';
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
      <Pdf
        source={{ uri: pdfUri, cache: true }}
        onLoadComplete={(numberOfPages, filePath) => {
          console.log(`Number of pages: ${numberOfPages}`);
        }}
        onPageChanged={(page, numberOfPages) => {
          console.log(`Current page: ${page}`);
        }}
        onError={(error) => {
          console.error("PDF Viewer Error", error);
          Alert.alert('Error', 'Could not load PDF document.');
        }}
        style={styles.pdf}
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
  pdf: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
