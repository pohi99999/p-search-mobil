// Metro configuration for Expo SDK 56.
//
// Purpose: redirect the native-only `react-native-google-mobile-ads`
// package to a web-safe stub (src/lib/mobileAdsWebStub.ts) when bundling
// for the "web" platform. The native package imports
// `codegenNativeComponent`, which Metro cannot resolve on web and fails
// the whole `npx expo export -p web` build otherwise.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const { resolveRequest: originalResolveRequest } = config.resolver;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-google-mobile-ads') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'src/lib/mobileAdsWebStub.ts'),
    };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
