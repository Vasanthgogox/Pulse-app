module.exports = {
  // Mock any specific exports from expo-constants that are being used
  // For now, we'll provide a basic mock for Constants
  Constants: {
    manifest: null,
    // Add other properties as needed if your code relies on them
  },
  // If EXDevLauncher is accessed directly, you might need to mock it like this:
  // EXDevLauncher: { someProperty: jest.fn() },
};