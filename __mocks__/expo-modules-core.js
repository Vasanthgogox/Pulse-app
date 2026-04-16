module.exports = {
  EventEmitter: jest.fn(() => ({
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  })),
  Platform: {
    OS: 'ios',
    select: jest.fn((options) => options.ios),
  },
  requireOptionalNativeModule: jest.fn(() => null), // Mock this function
  requireNativeModule: jest.fn(() => null), // Mock this function
};