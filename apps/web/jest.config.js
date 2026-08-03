const nextJest = require('next/jest');

// next/jest rather than a hand-rolled ts-jest transform: it reads next.config and tsconfig for us,
// so the `@/…` path alias, the SWC transform and the CSS-module stubs all match what `next build`
// actually does. A test that compiles differently from the app is a test that can pass on code the
// app would reject.
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    // The workspace package ships a committed dist/, but tests should fail against the source they
    // are meant to describe rather than against whatever was last built.
    '^@dental-crm/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  collectCoverageFrom: ['src/lib/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
};

module.exports = createJestConfig(config);
