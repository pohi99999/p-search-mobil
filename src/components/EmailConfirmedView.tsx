import React, { useEffect } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { logger } from '../utils/logger';

// Round 6 (Péter, Marveen 9160 E; Lumen builds the look, Kenshin wires it): the page a new user lands on after
// the link in the confirmation e-mail. It used to be the app's sign-in screen with no word about what had happened.
//
// A pure view. The hash is recognised, the token taken out of the URL and the screen put in front by App.tsx
// (Kenshin). Here only what is drawn:
//   - onSignIn: the "Belépés a weben" button; App.tsx signs the user in straight away when the link brought a
//     session, and otherwise leads to the sign-in screen. The label does not depend on which.
//   - showPlayButton: the Google Play button, behind a switch until there is a public release.
//
// Copy: the title and the sentence say what happened and what to do, with no promise of a time. PETER: the final
// wording of the Android line is the owner's (proposed 11-25, Lumen, Kenshin 9195: "most zárt tesztben van").

export const CONFIRMED_COPY = {
  title: 'Az e-mail címed megerősítve',
  lead: 'Köszönjük! A fiókod kész, a webes alkalmazásban most már be tudsz lépni.',
  signIn: 'Belépés a weben',
  androidLine: 'Az Android-alkalmazás most zárt tesztben van.',
  playButton: 'Letöltés a Google Playről',
} as const;

/**
 * The store listing of the app, from the package id (PaywallActivePro.tsx: com.pohankaestarsa.psearch) in the
 * standard Play URL form. There is no public listing yet, so the button that opens it stays behind showPlayButton.
 */
export const PLAY_LISTING_URL = 'https://play.google.com/store/apps/details?id=com.pohankaestarsa.psearch';

/**
 * The browser tab's title while this view is shown (Kenshin 9267: it read only "P-Search", every other screen reads
 * "Cím | P-Search"). The view is not a navigator screen, so it sets the tab itself, and gives the old title back when
 * it goes. Web only: native has no tab. No en or em dash: "|" separates, as in SCREEN_TITLES.
 */
export const CONFIRMED_TAB_TITLE = 'E-mail megerősítve | P-Search';

interface Props {
  onSignIn: () => void;
  showPlayButton: boolean;
}

export function EmailConfirmedView({ onSignIn, showPlayButton }: Props) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const doc = document;
    const before = doc.title;
    doc.title = CONFIRMED_TAB_TITLE;
    return () => {
      // only if nothing else has renamed the tab meanwhile (the navigator names it for the next screen)
      if (doc.title === CONFIRMED_TAB_TITLE) doc.title = before;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} testID="email-confirmed-scroll">
      <Surface style={styles.surface} elevation={4} testID="email-confirmed">
        <View style={styles.iconWrap} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <MaterialCommunityIcons name="check-decagram" size={56} color="#2E7D32" />
        </View>
        <Text variant="headlineSmall" role="heading" aria-level={1} style={styles.title} testID="email-confirmed-title">
          {CONFIRMED_COPY.title}
        </Text>
        <Text variant="bodyLarge" role="status" accessibilityLiveRegion="polite" style={styles.lead} testID="email-confirmed-lead">
          {CONFIRMED_COPY.lead}
        </Text>

        <Button
          mode="contained"
          onPress={onSignIn}
          style={styles.signIn}
          contentStyle={styles.signInContent}
          testID="email-confirmed-sign-in"
        >
          {CONFIRMED_COPY.signIn}
        </Button>

        <View style={styles.android}>
          <Text variant="bodyMedium" style={styles.androidLine} testID="email-confirmed-android">
            {CONFIRMED_COPY.androidLine}
          </Text>
          {showPlayButton ? (
            <Button
              mode="outlined"
              icon="google-play"
              onPress={() => Linking.openURL(PLAY_LISTING_URL).catch((err) => logger.error('A Play-lap nem nyílt meg:', err))}
              style={styles.play}
              contentStyle={styles.playContent}
              testID="email-confirmed-play"
            >
              {CONFIRMED_COPY.playButton}
            </Button>
          ) : null}
        </View>
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  surface: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    padding: 24,
    borderRadius: 16,
    backgroundColor: 'white',
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: 12,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    // #1A237E on white is 13.24:1 (the detail and settings headings).
    color: '#1A237E',
    marginBottom: 8,
  },
  lead: {
    textAlign: 'center',
    // #424242 on white is 10.05:1.
    color: '#424242',
    marginBottom: 24,
  },
  signIn: {
    alignSelf: 'stretch',
    borderRadius: 8,
  },
  signInContent: {
    minHeight: 48,
  },
  android: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C3C7CE',
  },
  androidLine: {
    textAlign: 'center',
    color: '#424242',
  },
  play: {
    alignSelf: 'stretch',
    marginTop: 12,
    borderRadius: 8,
  },
  playContent: {
    minHeight: 48,
  },
});
