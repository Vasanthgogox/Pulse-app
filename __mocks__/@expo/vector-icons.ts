
jest.mock('react-native-vector-icons/lib/create-icon-set', () => {
  const React = require('react') as typeof import('react');
  return (name: string) =>
    React.forwardRef<unknown, Record<string, unknown>>((props, ref) =>
      React.createElement(name, { ...props, ref }),
    );
});
jest.mock('react-native-vector-icons/lib/ensure-native-module-available', () => {});

export const FontAwesome = () => null;
export default {
  FontAwesome,
};