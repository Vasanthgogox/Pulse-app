import React from 'react';
import { View } from 'react-native';

type CompatProps = {
  children?: React.ReactNode;
  style?: any;
};

function NullMapPrimitive({ children, style }: CompatProps) {
  return <View style={style}>{children}</View>;
}

export const Callout = NullMapPrimitive;
export const Marker = NullMapPrimitive;
export const Polyline = NullMapPrimitive;

export default NullMapPrimitive;
