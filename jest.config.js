module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-purchases|react-native-google-mobile-ads|@revenuecat/.*|@react-native-async-storage/async-storage))'
  ],
  setupFilesAfterEnv: ['./setupJest.js'],
  testEnvironment: 'node',
  // supabase/functions/** are Deno Edge Functions (run via `deno test`, not
  // Jest) -- they use Deno-only URL imports (https://deno.land/std/...)
  // that Jest/Node cannot resolve, and must stay out of Jest's test run.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/supabase/'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '^test-renderer$': 'react-test-renderer',
  },
};
