/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        module: 'commonjs',
        types: ['node', 'jest']
      }
    }]
  },
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  testTimeout: 30000,
  clearMocks: true
};
