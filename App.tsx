import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper';
import { Session } from '@supabase/supabase-js';
import mobileAds from 'react-native-google-mobile-ads';
import { supabase } from './src/lib/supabase';

import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { ActionPlanScreen } from './src/screens/ActionPlanScreen';
import { CopilotChatScreen } from './src/screens/CopilotChatScreen';
import { BillingProvider } from './src/context/BillingContext';

import { RootStackParamList } from './src/types/navigation';

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
          console.warn('Failed to initialize Mobile Ads SDK:', error);
        });
    } catch (error) {
      console.warn('Synchronous error during Mobile Ads SDK initialization:', error);
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
      <PaperProvider theme={theme}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {session && session.user ? (
              <>
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                <Stack.Screen name="Paywall" component={PaywallScreen} options={{ presentation: 'modal' }} />
                <Stack.Screen name="ActionPlan" component={ActionPlanScreen} />
                <Stack.Screen name="CopilotChat" component={CopilotChatScreen} />
              </>
            ) : (
              <Stack.Screen name="Auth" component={AuthScreen} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </PaperProvider>
    </BillingProvider>
  );
}
