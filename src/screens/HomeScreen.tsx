import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Surface } from 'react-native-paper';
import { supabase } from '../lib/supabase';

export function HomeScreen() {
  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <View style={styles.container}>
      <Surface style={styles.surface} elevation={2}>
        <Text variant="headlineSmall" style={{ marginBottom: 16 }}>
          Üdvözlünk a P-Search-ben!
        </Text>
        <Text variant="bodyMedium" style={{ marginBottom: 24 }}>
          Itt fogod látni a cégprofilod alapján javasolt pályázatokat és hiteleket. Jelenleg még nincs beállítva a profilod.
        </Text>
        <Button mode="contained" onPress={() => {}} style={{ marginBottom: 12 }}>
          Cégprofil Létrehozása
        </Button>
        <Button mode="outlined" onPress={signOut}>
          Kijelentkezés
        </Button>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  surface: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: 'white',
  },
});
