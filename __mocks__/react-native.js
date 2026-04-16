module.exports = {
  NativeModules: {
    UIManager: {
      RCTView: {
        directEventTypes: {},
      },
    },
    RNGestureHandlerModule: {
      attachGestureHandler: jest.fn(),
      createGestureHandler: jest.fn(),
      dropGestureHandler: jest.fn(),
      updateGestureHandler: jest.fn(),
      State: { UNDETERMINED: 0, FAILED: 1, BEGAN: 2, CANCELLED: 3, ACTIVE: 4, END: 5 },
    },
    PlatformConstants: {
      forceTouchAvailable: false,
    },
    // Mock other native modules as needed
  },
  // Mock other common components from react-native
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  StyleSheet: {
    create: jest.fn((styles) => styles),
  },
  Platform: {
    OS: 'ios',
    select: jest.fn((options) => options.ios),
  },
  // Mock list components
  FlatList: 'FlatList',
  ScrollView: 'ScrollView',
  SectionList: 'SectionList',
  VirtualizedList: 'VirtualizedList',
  // Add any other necessary mocks here
};
