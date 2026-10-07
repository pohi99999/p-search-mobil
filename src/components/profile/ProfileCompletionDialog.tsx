import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Surface, Text, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { PROFILE_FIELDS, profileUpdateFromForm, type ProfileFieldKey, type ProfileForm } from '../../lib/profileCompleteness';
import { getErrorMessage } from '../../utils/error';

interface Props {
  visible: boolean;
  profileId: string;
  missing: ProfileFieldKey[];
  /** Saved: the caller refreshes the profile and runs the generation. */
  onSaved: () => void;
  /** "Kihagyom": the generation runs with what the profile has. */
  onSkip: () => void;
  onCancel: () => void;
}

/**
 * Asks for the empty key fields before a plan or a PDF is generated (card 431a496e). Skippable: the
 * server no longer writes "nincs megadva" either way, but the document is only specific with real data.
 */
export function ProfileCompletionDialog({ visible, profileId, missing, onSaved, onSkip, onCancel }: Props) {
  const [form, setForm] = useState<ProfileForm>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = PROFILE_FIELDS.filter((f) => missing.includes(f.key));

  const save = async () => {
    const parsed = profileUpdateFromForm(form);
    if (!parsed.ok) { setError(parsed.error); return; }
    if (Object.keys(parsed.update).length === 0) { onSkip(); return; }
    setSaving(true);
    setError(null);
    try {
      const { error: dbError } = await supabase.from('business_profiles').update(parsed.update).eq('id', profileId);
      if (dbError) throw dbError;
      onSaved();
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'Nem sikerült menteni a cégadatokat.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Surface style={styles.box} elevation={4}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text variant="titleMedium" style={styles.title}>Pontosabb dokumentum a cégadatokkal</Text>
            <Text variant="bodyMedium" style={styles.lead}>
              Ezek az adatok még hiányoznak a cégprofilodból. Ha megadod őket, az akcióterv és az üzleti terv a cégedre szabott lesz. Később is kitöltheted.
            </Text>
            {fields.map((f) => (
              <TextInput
                key={f.key}
                testID={`profile-field-${f.key}`}
                label={f.label}
                placeholder={f.placeholder}
                value={form[f.key] ?? ''}
                onChangeText={(text) => setForm((prev) => ({ ...prev, [f.key]: text }))}
                keyboardType={f.numeric ? 'number-pad' : 'default'}
                multiline={f.key === 'goals'}
                mode="outlined"
                style={styles.input}
              />
            ))}
            {error ? <HelperText type="error" visible>{error}</HelperText> : null}
            <View style={styles.actions}>
              <Button testID="profile-skip" onPress={onSkip} disabled={saving}>Kihagyom</Button>
              <Button testID="profile-save" mode="contained" onPress={save} loading={saving} disabled={saving}>Mentés és tovább</Button>
            </View>
          </ScrollView>
        </Surface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 },
  box: { borderRadius: 12, padding: 16, maxHeight: '90%', backgroundColor: '#fff' },
  title: { fontWeight: 'bold', marginBottom: 8 },
  lead: { color: '#555', marginBottom: 12 },
  input: { marginBottom: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8, flexWrap: 'wrap' },
});
