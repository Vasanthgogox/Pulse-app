import { DRIVER_BRAND_MARK } from '@/constants/DriverBrand';
import Typography from '@/constants/Typography';
import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  color?: string;
  style?: StyleProp<TextStyle>;
};

/** Global driver shell brand label — same typography as legacy Q PILOT header. */
export function DriverBrandMark({ color, style }: Props) {
  return (
    <Text style={[styles.brand, color != null ? { color } : null, style]}>
      {DRIVER_BRAND_MARK}
    </Text>
  );
}

const styles = StyleSheet.create({
  brand: {
    ...Typography.headerSubtitle,
    marginBottom: 1,
  },
});
