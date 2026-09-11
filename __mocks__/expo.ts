jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {},
  },
}));

jest.mock('expo-font', () => ({
  loadAsync: jest.fn(),
}));

jest.mock(
  'expo-asset',
  () => ({
    Asset: {
      fromModule: jest.fn(() => ({
        downloadAsync: jest.fn(),
      })),
    },
  }),
  { virtual: true },
);

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(() => Promise.resolve({ uri: 'mocked-image-uri', width: 100, height: 100 })),
}));