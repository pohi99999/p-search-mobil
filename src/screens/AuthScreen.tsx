import React, { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Text, Surface, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const theme = useTheme();

  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) Alert.alert('Hiba bejelentkezéskor', error.message);
    setLoading(false);
  }

  async function signUpWithEmail() {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (error) {
      Alert.alert('Hiba regisztrációkor', error.message);
    } else if (data.session == null) {
      Alert.alert('Sikeres regisztráció!', 'Kérlek ellenőrizd az e-mail fiókodat a megerősítő linkért.');
    } else {
      Alert.alert('Sikeres regisztráció!');
    }
    setLoading(false);
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
            Zéró-Költségvetésű Növekedés
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
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Jelszó"
            left={<TextInput.Icon icon={(props) => <MaterialCommunityIcons name="lock" {...props} />} />}
            onChangeText={(text) => setPassword(text)}
            value={password}
            secureTextEntry={true}
            placeholder="Jelszó"
            autoCapitalize={'none'}
            mode="outlined"
            style={styles.input}
          />

          <Button
            mode="contained"
            disabled={loading}
            onPress={isLogin ? signInWithEmail : signUpWithEmail}
            style={styles.button}
            contentStyle={{ paddingVertical: 8 }}
          >
            {isLogin ? 'Bejelentkezés' : 'Regisztráció'}
          </Button>

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

const styles = StyleSheet.create({
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
