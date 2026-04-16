import React from 'react';
import { View, Text } from 'react-native';
import type { InvoicePdfData } from '@/components/InvoicePdf.types';
// import your native pdf generator/viewer here

interface InvoicePdfNativeProps {
  invoiceData: InvoicePdfData;
  onFinalize?: () => void;
  isFinalizing?: boolean;
}

export default function InvoicePdfNative({ invoiceData }: InvoicePdfNativeProps) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{invoiceData.brandingCompanyName}</Text>
      <Text>Native PDF Viewer for Invoice #{invoiceData.invoiceNo}</Text>
      {/* Native PDF logic goes here */}
    </View>
  );
}