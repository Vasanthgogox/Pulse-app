module.exports = {
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ cancelled: true })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ cancelled: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
};
