module.exports = {
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'test/tsconfig.json' }]
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testMatch: ['**/*.spec.(ts)'],
  testEnvironment: 'node',
  // Fix for ES modules like uuid
  transformIgnorePatterns: ['node_modules/(?!(uuid|@livekit|nanoid)/)']
}
