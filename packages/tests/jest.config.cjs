/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        strict: false,
        noImplicitAny: false,
        esModuleInterop: true,
        jsx: 'react-jsx',
        baseUrl: __dirname,
        paths: {
          '@motifx/core/internal': ['../motifjs/dist/internal.d.ts']
        }
      }
    }]
  },
  moduleNameMapper: {
    '^@motifx/core$': '<rootDir>/../motifjs/dist/index.cjs',
    '^@motifx/core/devtools$': '<rootDir>/../motifjs/dist/devtools.cjs',
    '^@motifx/core/internal$': '<rootDir>/../motifjs/dist/internal.cjs'
  },
  setupFilesAfterEnv: [],
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  verbose: true,
  testTimeout: 30000,
  // Ensure jest exits cleanly even if some handles remain (known jsdom timers in stress tests)
  forceExit: true,
  // Clear mocks between tests
  clearMocks: true,
  // Collect coverage from source files
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}'
  ]
};
