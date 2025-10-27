module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/lib/tccMessage.js'
  ],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100
    }
  }
};
