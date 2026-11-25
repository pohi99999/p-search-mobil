import React, { useRef, useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Linking, ScrollView, type TextInput as RNTextInput } from 'react-native';
import { TextInput, Button, Text, Surface, HelperText, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../lib/legalLinks';
import { logger } from '../utils/logger';
import { notify } from '../lib/notify';

/** The minimum the sign-up check below enforces; shown under the password field before the user types. */
export const PASSWORD_MIN_LENGTH = 8;

/** True when Supabase reports the e-mail is already registered (empty identities, no mail sent). */
export function isRepeatedSignUp(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

/**
 * Review 2026-11-03: the envelope and padlock in front of the fields only decorate. Paper renders every
 * TextInput.Icon as a button, so on web each was a tab stop with no readable name. These props take
 * them out of the tab order and hide them from assistive technology; the eye button keeps its own.
 */
const DECORATIVE_ICON_PROPS = {
  focusable: false,
  tabIndex: -1,
  accessible: false,
  importantForAccessibility: 'no-hide-descendants',
  'aria-hidden': true,
} as const;

/**
 * Round 6 (Lumen P1-4): what is wrong with a field is said under that field, in red, not in a dialog that stood
 * over the form and hid the field it was about. The messages, by field.
 */
export const FIELD_ERRORS = {
  emailMissing: 'Add meg az e-mail címed.',
  emailInvalid: 'Kérlek, valós e-mail címet adj meg.',
  passwordMissing: 'Add meg a jelszavad.',
  passwordShort: `A jelszónak legalább ${PASSWORD_MIN_LENGTH} karakter hosszúnak kell lennie.`,
  resetNeedsEmail: 'Add meg a fiókod e-mail címét, és utána kérd a jelszó-visszaállítást.',
} as const;

/** The first problem of each field, or null. Sign-in and sign-up check the same. */
export function fieldErrors(email: string, password: string): { email: string | null; password: string | null } {
  const emailError = !email ? FIELD_ERRORS.emailMissing : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? FIELD_ERRORS.emailInvalid : null;
  const passwordError = !password ? FIELD_ERRORS.passwordMissing : password.length < PASSWORD_MIN_LENGTH ? FIELD_ERRORS.passwordShort : null;
  return { email: emailError, password: passwordError };
}

/** The password-reset confirmation (same text whether or not the account exists). */
export const RESET_SENT_TITLE = 'Ellenőrizd az e-mailed';
export const RESET_SENT_MESSAGE = 'Ha van ilyen fiók, elküldtük a jelszó-visszaállító linket. A link egy óráig érvényes.';

/** vc23 (Lumen L8): the three lines under the name. Each one is something the app does now (search, card, Pro). */
export const AUTH_PROMISE_LINES: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; text: string }[] = [
  { icon: 'magnify', text: 'A cégprofilod alapján az AI kiválasztja a hozzád illő nyitott kiírásokat.' },
  { icon: 'calendar-clock', text: 'Minden találatnál látod, miért illik, mekkora az összeg és meddig adható be.' },
  { icon: 'file-document-edit-outline', text: 'Pro: akcióterv és dokumentum-vázlat a beadáshoz.' },
];

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  // Web only: react-native-web's Alert.alert shows nothing, so the reset confirmation is shown on the screen.
  const [resetNotice, setResetNotice] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const emailRef = useRef<RNTextInput>(null);
  const passwordRef = useRef<RNTextInput>(null);
  const theme = useTheme();

  const isValidEmail = (email: string) => fieldErrors(email, 'x'.repeat(PASSWORD_MIN_LENGTH)).email === null;

  /** Marks the wrong fields and puts the focus on the first one; true when both are fine. */
  const validateInputs = () => {
    const errors = fieldErrors(email, password);
    setEmailError(errors.email);
    setPasswordError(errors.password);
    if (errors.email) emailRef.current?.focus();
    else if (errors.password) passwordRef.current?.focus();
    return !errors.email && !errors.password;
  };

  async function signInWithEmail() {
    if (!validateInputs()) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) notify('Hiba bejelentkezéskor', 'Érvénytelen e-mail cím vagy jelszó.');
    setLoading(false);
  }

  async function signUpWithEmail() {
    if (!validateInputs()) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (error) {
      notify('Hiba regisztrációkor', 'A regisztráció során hiba lépett fel. Kérlek, próbáld újra.');
    } else if (isRepeatedSignUp(data.user)) {
      // Supabase answers a sign-up for an already registered, confirmed e-mail with
      // HTTP 200 and an empty `identities` array ("user_repeated_signup") and sends
      // NO e-mail, so the "check your inbox" message would be misleading here.
      notify(
        'Ezzel az e-mail címmel már van fiók',
        'Nem küldtünk új megerősítő levelet. Jelentkezz be a jelszavaddal.',
        [{ text: 'Bejelentkezés', onPress: () => setIsLogin(true) }],
      );
    } else if (data.session == null) {
      notify('Sikeres regisztráció!', 'Kérlek ellenőrizd az e-mail fiókodat a megerősítő linkért.');
    }
    // vc23 (Lumen L8): with a session the app goes on to the company profile by itself; the bare
    // "Sikeres regisztráció!" modal only stood over that form and had to be closed first.
    setLoading(false);
  }

  /** Where the recovery mail's link lands: the static reset page shipped with the web build. */
  const RESET_PASSWORD_URL = 'https://p-search-mobil.vercel.app/reset-password';

  async function sendPasswordReset() {
    if (!email || !isValidEmail(email)) {
      setEmailError(FIELD_ERRORS.resetNeedsEmail);
      emailRef.current?.focus();
      return;
    }
    setResetNotice(false);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: RESET_PASSWORD_URL });
    setLoading(false);
    if (error) {
      const tooMany = /rate limit|too many/i.test(error.message);
      notify(
        'Nem sikerült a kérés',
        tooMany ? 'Túl sok kérés érkezett rövid idő alatt. Próbáld újra kicsit később.' : 'Kérlek, próbáld újra később.',
      );
      return;
    }
    // Same message whether or not the address exists: no account enumeration.
    if (Platform.OS === 'web') {
      setResetNotice(true);
    } else {
      notify(RESET_SENT_TITLE, RESET_SENT_MESSAGE);
    }
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* vc23 (Lumen L8): with the promise lines the card is taller than a 360x640 screen; centred in a plain View
          its top was cut off (web, measured). A ScrollView keeps it centred when it fits and scrollable when not. */}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" testID="auth-scroll">
      <Surface style={styles.surface} elevation={4}>
        <View style={styles.header}>
          <Text variant="headlineMedium" role="heading" aria-level={1} style={{ fontWeight: 'bold', color: theme.colors.primary }}>
            P-Search
          </Text>
          <Text variant="titleMedium" style={{ color: theme.colors.secondary, marginTop: 8 }}>
            Pályázatkereső magyar KKV-knak
          </Text>
        </View>

        {/* vc23 (Lumen L8): what the app does, before the e-mail field. Only what it really does today. */}
        <View style={styles.promise} testID="auth-promise">
          {AUTH_PROMISE_LINES.map(({ icon, text }) => (
            <View key={icon} style={styles.promiseRow}>
              <MaterialCommunityIcons name={icon} size={20} color="#1565C0" />
              <Text variant="bodyMedium" style={styles.promiseText}>{text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.form}>
          <TextInput
            label="E-mail cím"
            left={<TextInput.Icon icon={(props) => <MaterialCommunityIcons name="email" {...props} />} {...DECORATIVE_ICON_PROPS} testID="auth-email-icon" />}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError(null);
            }}
            value={email}
            ref={emailRef}
            error={!!emailError}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? 'auth-email-error' : undefined}
            placeholder="ceged@pelda.hu"
            autoCapitalize={'none'}
            // Round 3 (Lumen P1): the e-mail keyboard and the password manager's autofill on phones.
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCorrect={false}
            mode="outlined"
            style={styles.input}
            testID="auth-email"
          />
          {emailError ? (
            <HelperText type="error" visible nativeID="auth-email-error" id="auth-email-error" role="alert" accessibilityLiveRegion="polite" style={styles.fieldError} testID="auth-email-error">
              {emailError}
            </HelperText>
          ) : null}
          <TextInput
            label="Jelszó"
            left={<TextInput.Icon icon={(props) => <MaterialCommunityIcons name="lock" {...props} />} {...DECORATIVE_ICON_PROPS} testID="auth-password-icon" />}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) setPasswordError(null);
            }}
            value={password}
            ref={passwordRef}
            error={!!passwordError}
            aria-invalid={!!passwordError}
            aria-describedby={passwordError ? 'auth-password-error' : undefined}
            secureTextEntry={!showPassword}
            placeholder="Jelszó"
            autoCapitalize={'none'}
            autoCorrect={false}
            // A new account gets the password manager's "suggest a strong password", sign-in its saved one.
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            textContentType={isLogin ? 'password' : 'newPassword'}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
                accessibilityLabel={showPassword ? 'Jelszó elrejtése' : 'Jelszó megjelenítése'}
                testID="auth-password-toggle"
              />
            }
            mode="outlined"
            style={styles.input}
            testID="auth-password"
          />
          {passwordError ? (
            <HelperText type="error" visible nativeID="auth-password-error" id="auth-password-error" role="alert" accessibilityLiveRegion="polite" style={styles.fieldError} testID="auth-password-error">
              {passwordError}
            </HelperText>
          ) : null}
          {/* The rule before typing; once the password is wrong, its error line says the same, so the rule steps aside. */}
          {!isLogin && !passwordError && (
            <Text variant="bodySmall" style={styles.hint} testID="auth-password-rule">
              {`Legalább ${PASSWORD_MIN_LENGTH} karakter.`}
            </Text>
          )}

          <Button
            mode="contained"
            disabled={loading}
            onPress={isLogin ? signInWithEmail : signUpWithEmail}
            style={styles.button}
            contentStyle={{ paddingVertical: 8 }}
          >
            {isLogin ? 'Bejelentkezés' : 'Regisztráció'}
          </Button>

          {!isLogin && (
            // Round 3 (Lumen P1): the sign-up names the terms and the privacy notice, with links.
            <Text variant="bodySmall" style={styles.consent} testID="auth-consent">
              {'A regisztrációval elfogadod az '}
              <Text
                style={styles.link}
                accessibilityRole="link"
                onPress={() => openLegal(TERMS_URL)}
                testID="auth-terms-link"
              >
                ÁSZF
              </Text>
              {'-et és az '}
              <Text
                style={styles.link}
                accessibilityRole="link"
                onPress={() => openLegal(PRIVACY_POLICY_URL)}
                testID="auth-privacy-link"
              >
                Adatkezelési tájékoztatót
              </Text>
              {'.'}
            </Text>
          )}

          {isLogin && (
            <Button
              mode="text"
              onPress={sendPasswordReset}
              disabled={loading}
              style={styles.switchButton}
              contentStyle={styles.textButtonContent}
              accessibilityLabel="Elfelejtett jelszó, visszaállító levél kérése"
            >
              Elfelejtett jelszó?
            </Button>
          )}

          {isLogin && resetNotice && (
            <Text
              variant="bodyMedium"
              style={styles.notice}
              accessibilityLiveRegion="polite"
              role="status"
              testID="auth-reset-notice"
            >
              <Text style={styles.noticeTitle}>{RESET_SENT_TITLE}</Text>
              {`\n${RESET_SENT_MESSAGE}`}
            </Text>
          )}

          <Button
            mode="text"
            onPress={() => {
              setIsLogin(!isLogin);
              setEmailError(null);
              setPasswordError(null);
            }}
            style={styles.switchButton}
            contentStyle={styles.textButtonContent}
          >
            {isLogin ? 'Nincs még fiókod? Regisztrálj!' : 'Már van fiókod? Lépj be!'}
          </Button>
        </View>
      </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function openLegal(url: string) {
  Linking.openURL(url).catch((err) => logger.error('A jogi oldal nem nyílt meg:', err));
}

const styles = StyleSheet.create({
  hint: {
    marginTop: -8,
    color: '#616161',
  },
  // Under its field, in the form's 16 px gap. Paper's error red #B3261E on white is 6.5:1.
  fieldError: {
    marginTop: -12,
    paddingHorizontal: 4,
  },
  consent: {
    color: '#424242',
    textAlign: 'center',
  },
  notice: {
    color: '#1B5E20',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
  },
  noticeTitle: {
    fontWeight: 'bold',
  },
  link: {
    color: '#1565C0',
    textDecorationLine: 'underline',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  surface: {
    // On a laptop the card filled the window (a 1192 px wide button at 1280, 2026-11-13).
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    padding: 24,
    borderRadius: 16,
    backgroundColor: 'white',
  },
  promise: {
    marginBottom: 16,
    gap: 8,
  },
  promiseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  // #424242 on white is 10.4:1.
  promiseText: {
    flex: 1,
    color: '#424242',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: 'white',
  },
  button: {
    marginTop: 8,
    borderRadius: 8,
  },
  switchButton: {
    marginTop: 8,
  },
  // The two text links were 38 px tall; 44 px is the smallest comfortable touch target.
  textButtonContent: {
    minHeight: 44,
  },
});
