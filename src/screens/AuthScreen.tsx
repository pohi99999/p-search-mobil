import React, { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { TextInput, Button, Text, Surface, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../lib/legalLinks';
import { logger } from '../utils/logger';

/** The minimum the sign-up check below enforces; shown under the password field before the user types. */
export const PASSWORD_MIN_LENGTH = 8;

/** True when Supabase reports the e-mail is already registered (empty identities, no mail sent). */
export function isRepeatedSignUp(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const theme = useTheme();


  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateInputs = () => {
    if (!email || !password) {
      Alert.alert('Érvénytelen adat', 'Kérlek, töltsd ki az összes mezőt.');
      return false;
    }
    if (!isValidEmail(email)) {
      Alert.alert('Érvénytelen adat', 'Kérlek, valós e-mail címet adj meg.');
      return false;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      Alert.alert('Érvénytelen adat', 'A jelszónak legalább 8 karakter hosszúnak kell lennie.');
      return false;
    }
    return true;
  };

  async function signInWithEmail() {
    if (!validateInputs()) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) Alert.alert('Hiba bejelentkezéskor', 'Érvénytelen e-mail cím vagy jelszó.');
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
      Alert.alert('Hiba regisztrációkor', 'A regisztráció során hiba lépett fel. Kérlek, próbáld újra.');
    } else if (isRepeatedSignUp(data.user)) {
      // Supabase answers a sign-up for an already registered, confirmed e-mail with
      // HTTP 200 and an empty `identities` array ("user_repeated_signup") and sends
      // NO e-mail, so the "check your inbox" message would be misleading here.
      Alert.alert(
        'Ezzel az e-mail címmel már van fiók',
        'Nem küldtünk új megerősítő levelet. Jelentkezz be a jelszavaddal.',
        [{ text: 'Bejelentkezés', onPress: () => setIsLogin(true) }],
      );
    } else if (data.session == null) {
      Alert.alert('Sikeres regisztráció!', 'Kérlek ellenőrizd az e-mail fiókodat a megerősítő linkért.');
    } else {
      Alert.alert('Sikeres regisztráció!');
    }
    setLoading(false);
  }

  /** Where the recovery mail's link lands: the static reset page shipped with the web build. */
  const RESET_PASSWORD_URL = 'https://p-search-mobil.vercel.app/reset-password';

  async function sendPasswordReset() {
    if (!email || !isValidEmail(email)) {
      Alert.alert('Érvénytelen adat', 'Add meg a fiókod e-mail címét, és utána kérd a jelszó-visszaállítást.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: RESET_PASSWORD_URL });
    setLoading(false);
    if (error) {
      const tooMany = /rate limit|too many/i.test(error.message);
      Alert.alert(
        'Nem sikerült a kérés',
        tooMany ? 'Túl sok kérés érkezett rövid idő alatt. Próbáld újra kicsit később.' : 'Kérlek, próbáld újra később.',
      );
      return;
    }
    // Same message whether or not the address exists: no account enumeration.
    Alert.alert('Ellenőrizd az e-mailed', 'Ha van ilyen fiók, elküldtük a jelszó-visszaállító linket. A link egy óráig érvényes.');
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Surface style={styles.surface} elevation={4}>
        <View style={styles.header}>
          <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
            P-Search
          </Text>
          <Text variant="titleMedium" style={{ color: theme.colors.secondary, marginTop: 8 }}>
            Pályázatkereső magyar KKV-knak
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            label="E-mail cím"
            left={<TextInput.Icon icon={(props) => <MaterialCommunityIcons name="email" {...props} />} />}
            onChangeText={(text) => setEmail(text)}
            value={email}
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
          <TextInput
            label="Jelszó"
            left={<TextInput.Icon icon={(props) => <MaterialCommunityIcons name="lock" {...props} />} />}
            onChangeText={(text) => setPassword(text)}
            value={password}
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
          {!isLogin && (
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
              accessibilityLabel="Elfelejtett jelszó, visszaállító levél kérése"
            >
              Elfelejtett jelszó?
            </Button>
          )}

          <Button
            mode="text"
            onPress={() => setIsLogin(!isLogin)}
            style={styles.switchButton}
          >
            {isLogin ? 'Nincs még fiókod? Regisztrálj!' : 'Már van fiókod? Lépj be!'}
          </Button>
        </View>
      </Surface>
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
  consent: {
    color: '#424242',
    textAlign: 'center',
  },
  link: {
    color: '#1565C0',
    textDecorationLine: 'underline',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  surface: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: 'white',
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
});
