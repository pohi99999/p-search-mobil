import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper';
import { Session } from '@supabase/supabase-js';
import mobileAds from 'react-native-google-mobile-ads';
import * as Sentry from '@sentry/react-native';
import { supabase } from './src/lib/supabase';
import { SENTRY_DSN } from './src/config/env';
import { logger } from './src/utils/logger';

import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { ActionPlanScreen } from './src/screens/ActionPlanScreen';
import { CopilotChatScreen } from './src/screens/CopilotChatScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { DocumentUploadScreen } from './src/screens/DocumentUploadScreen';
import { GrantDetailScreen } from './src/screens/GrantDetailScreen';
import { BillingProvider } from './src/context/BillingContext';
import { ProfileProvider } from './src/context/ProfileContext';
import { WebNotifier } from './src/components/WebNotifier';
import { WebFrame } from './src/components/WebFrame';

import type { RootStackParamList } from './src/types/navigation';
import { SCREEN_TITLES } from './src/config/screenTitles';

// Csak akkor inicializáljuk, ha van beállított DSN -- e nélkül a Sentry
// hívások (logger.ts-en keresztül) biztonságosan no-op-ok maradnak.
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
  });
}

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1976D2', // Profi kék árnyalat
    secondary: '#424242',
  },
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // MobileAds SDK inicializálása biztonságosan try-catch blokkban
    try {
      mobileAds()
        .initialize()
        .catch(error => {
          // Csendben elkapjuk a hibát, hogy ne omoljon össze az app
          logger.warn('Failed to initialize Mobile Ads SDK:', error);
        });
    } catch (error) {
      logger.warn('Synchronous error during Mobile Ads SDK initialization:', error);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  return (
    <BillingProvider>
      <ProfileProvider>
        <PaperProvider theme={theme}>
        <NavigationContainer>
          <WebFrame>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {session && session.user ? (
              <>
                <Stack.Screen name="Home" component={HomeScreen} options={{ title: SCREEN_TITLES.Home }} />
                <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ title: SCREEN_TITLES.Onboarding }} />
                <Stack.Screen name="Paywall" component={PaywallScreen} options={{ presentation: 'modal', title: SCREEN_TITLES.Paywall }} />
                <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: SCREEN_TITLES.Settings }} />
                <Stack.Screen name="DocumentUpload" component={DocumentUploadScreen} options={{ title: SCREEN_TITLES.DocumentUpload }} />
                <Stack.Screen name="GrantDetail" component={GrantDetailScreen} options={{ title: SCREEN_TITLES.GrantDetail }} />
                <Stack.Screen name="ActionPlan" component={ActionPlanScreen} options={{ title: SCREEN_TITLES.ActionPlan }} />
                <Stack.Screen name="CopilotChat" component={CopilotChatScreen} options={{ title: SCREEN_TITLES.CopilotChat }} />
              </>
            ) : (
              <Stack.Screen name="Auth" component={AuthScreen} options={{ title: SCREEN_TITLES.Auth }} />
            )}
          </Stack.Navigator>
          </WebFrame>
        </NavigationContainer>
        <WebNotifier />
        </PaperProvider>
      </ProfileProvider>
    </BillingProvider>
  );
}
