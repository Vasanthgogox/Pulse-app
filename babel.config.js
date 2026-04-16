module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Required for react-native-reanimated worklets (release builds can crash without this)
    plugins: ['react-native-reanimated/plugin'],
  };
};

