import React from 'react';

jest.mock('react-native-vector-icons/lib/create-icon-set', () => {
  const React = require('react');
  return (name) => React.forwardRef((props, ref) => React.createElement(name, { ...props, ref }));
});
jest.mock('react-native-vector-icons/lib/ensure-native-module-available', () => {});

export const FontAwesome = () => null;
export default {
  FontAwesome,
};