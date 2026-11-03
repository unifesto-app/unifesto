/**
 * `npm test`: the S65 smoke tests (test/smoke, screens rendered with the API
 * stubbed at fetch) and the unit specs beside the code (src/**\/*.spec.ts).
 */
const { transformIgnorePatterns } = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/test/**/*.test.tsx', '<rootDir>/src/**/*.spec.ts'],
  setupFiles: ['<rootDir>/test/smoke/setup.ts'],
  // The icon pack ships ESM only, so it's compiled like the RN packages.
  transformIgnorePatterns: transformIgnorePatterns.map((p) => p.replace('(?!(', '(?!(@unifesto|')),
};
