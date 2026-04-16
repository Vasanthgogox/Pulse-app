/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./__mocks__/expo.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '@expo/vector-icons$': '<rootDir>/__mocks__/@expo/vector-icons.ts',
    '@react-native-async-storage/async-storage': '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
    'expo-image-manipulator': '<rootDir>/__mocks__/expo-image-manipulator.js',
    'expo-image-picker': '<rootDir>/__mocks__/expo-image-picker.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|expo|@expo|react-native-safe-area-context))',
  ],
};
