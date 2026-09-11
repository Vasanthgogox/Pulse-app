import React from 'react';
import { View, Text } from 'react-native';
import type { InvoicePdfData } from '@/components/InvoicePdf.types';

interface InvoicePdfNativeProps {
  invoiceData: InvoicePdfData;
  initialShowSplit?: boolean;
  onBack?: () => void;
}

export default function InvoicePdfNative({ invoiceData }: InvoicePdfNativeProps) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text>{invoiceData.brandingCompanyName}</Text>
      <Text>DRAFT</Text>
      <Text>{invoiceData.invoiceNumberCaption}</Text>
    </View>
  );
}
