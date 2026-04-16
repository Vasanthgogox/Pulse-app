module.exports = {
  manipulateAsync: jest.fn(() => Promise.resolve({ uri: 'mocked-image-uri', width: 100, height: 100 })),
};
