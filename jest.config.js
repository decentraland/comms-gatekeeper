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
  // The integration runner boots the whole component graph, migrations included, in a
  // beforeAll hook. Under a loaded machine that can exceed Jest's 5 s default, and then every
  // case in the file fails with "Cannot get the components before the test program is
  // initialized". Assertions still fail fast; this only widens the ceiling for genuine waits.
  testTimeout: 30000,
  // Fix for ES modules like uuid
  transformIgnorePatterns: ['node_modules/(?!(uuid|@livekit|nanoid)/)']
}
