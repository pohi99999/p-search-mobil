module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|@sentry/.*|native-base|react-native-svg|react-native-purchases|react-native-google-mobile-ads|@revenuecat/.*|@react-native-async-storage/async-storage))'
  ],
  setupFilesAfterEnv: ['./setupJest.js'],
  // Jest defaults to (cores - 1) workers. On a 16-core box that is 15 workers
  // each running its own cold Babel transform, and the machine thrashes: three
  // consecutive cold runs (`jest --clearCache` first) failed two tests every
  // time with "Exceeded timeout of 5000 ms", while the same tests take ~236 ms
  // warm. The tests are not slow -- they were starved of CPU.
  //
  // Measured on this repository, cold each time:
  //   default (15 workers)  29.2 s, 2 failed   <- 3 of 3 runs
  //   maxWorkers 4          16.3 s, all passed <- 3 of 3 runs
  //   maxWorkers 25%        18.2 s, all passed
  // Capping is both greener and faster, so no test timeout is raised: raising
  // it would only hide the starvation.
  //
  // 25% rather than a fixed 4 so the cap travels: 4 workers here, and on a
  // 2-core CI runner it floors to 1 instead of oversubscribing it.
  maxWorkers: '25%',
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
