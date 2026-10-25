import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { TextInput, Button, Text, Surface, HelperText } from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { huTaxNumberWarning, normalizeHuTaxNumber } from '../lib/taxNumber';
import { AdBanner } from '../components/AdBanner';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import type { RouteProp } from '@react-navigation/native';
import { useProfile } from '../context/ProfileContext';

import { getErrorMessage } from '../utils/error';
import { logger } from '../utils/logger';
import { profileFlags, track } from '../services/events';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type OnboardingScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

type OnboardingScreenRouteProp = RouteProp<RootStackParamList, 'Onboarding'>;

export function OnboardingScreen({ navigation, route }: { navigation: OnboardingScreenNavigationProp; route?: OnboardingScreenRouteProp }) {
  // Card fa68ea84: the same form edits an existing profile (Settings -> Cégprofil szerkesztése).
  // Until now a profile could be filled once (onboarding or the profile gate) and never corrected.
  const { profile: existingProfile, refreshProfile } = useProfile();
  const editMode = route?.params?.edit === true && !!existingProfile;
  // Edge-to-edge: when no banner is shown (Pro, or the ad failed), the button must still clear the navigation bar.
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Field-level errors: one message under the field it belongs to (until now a bad number gave the generic
  // "Hiba történt a mentés során." at the top of the form, far from the button and naming no field).
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const clearFieldError = (key: keyof FieldErrors) =>
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const [form, setForm] = useState({
    company_name: '',
    tax_number: '',
    industry_code: '',
    employee_count: '',
    yearly_revenue: '',
    goals: '',
  });
  useEffect(() => {
    if (!editMode || !existingProfile) return;
    setForm({
      company_name: existingProfile.company_name ?? '',
      tax_number: existingProfile.tax_number ?? '',
      industry_code: existingProfile.industry_code ?? '',
      employee_count: existingProfile.employee_count != null ? String(existingProfile.employee_count) : '',
      yearly_revenue: existingProfile.yearly_revenue != null ? String(existingProfile.yearly_revenue) : '',
      goals: existingProfile.goals ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, existingProfile?.id]);
  const [viesHint, setViesHint] = useState<string | null>(null);
  // A malformed tax number only warns, and only once the user left the field or pressed save (not mid-typing).
  const [taxTouched, setTaxTouched] = useState(false);
  const taxWarning = taxTouched ? huTaxNumberWarning(form.tax_number) : null;
  const [viesLookedUp, setViesLookedUp] = useState<string | null>(null);

  // VIES pre-fill (kanban eeac42d8, B2/3): once the tax number has its first 8
  // digits, ask the vies-check function for the registered name/address and
  // fill ONLY an empty company-name field. A miss or an outage changes nothing.
  const lookupVies = async (taxNumber: string, currentCompanyName: string) => {
    const vat8 = normalizeHuTaxNumber(taxNumber);
    if (!vat8 || vat8 === viesLookedUp) return;
    setViesLookedUp(vat8);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('vies-check', { body: { tax_number: vat8 } });
      if (fnError || !data?.found) {
        setViesHint(null);
        return;
      }
      setViesHint(`VIES: ${data.name ?? ''}${data.address ? `, ${data.address}` : ''}`);
      if (!currentCompanyName.trim() && data.name) {
        setForm((prev) => (prev.company_name.trim() ? prev : { ...prev, company_name: data.name }));
      }
    } catch (e: unknown) {
      logger.warn('VIES lekérdezés hiba:', getErrorMessage(e));
    }
  };


  const handleSave = async () => {
    setTaxTouched(true);
    // Spaces are allowed in the numbers ("50 000 000"); anything else is reported at its field.
    const employeeCountStr = form.employee_count ? form.employee_count.replace(/\s/g, '') : '';
    const yearlyRevenueStr = form.yearly_revenue ? form.yearly_revenue.replace(/\s/g, '') : '';
    const errors = validateProfileForm(form.company_name, employeeCountStr, yearlyRevenueStr);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Nincs bejelentkezett felhasználó!');

      const values = {
        company_name: form.company_name,
        tax_number: form.tax_number,
        industry_code: form.industry_code,
        employee_count: employeeCountStr ? parseInt(employeeCountStr, 10) : null,
        yearly_revenue: yearlyRevenueStr ? parseInt(yearlyRevenueStr, 10) : null,
        goals: form.goals,
      };

      if (editMode && existingProfile) {
        // Edit: update the user's own row (RLS: own profile only), refresh the context, go back.
        const { error: updateError } = await supabase
          .from('business_profiles')
          .update(values)
          .eq('id', existingProfile.id);
        if (updateError) throw updateError;
        track('profile_updated', profileFlags(values));
        await refreshProfile();
        if (navigation.canGoBack()) navigation.goBack(); else navigation.replace('Home');
        return;
      }

      const { data: newProfile, error: dbError } = await supabase
        .from('business_profiles')
        .insert([{ user_id: session.user.id, ...values }])
        .select()
        .single();

      if (dbError) throw dbError;
      track('onboarding_done', profileFlags(values));

      // Keresés indítása edge functionön keresztül (Fire and forget, nem várjuk meg)
      if (newProfile) {
        supabase.functions.invoke('trigger-n8n-webhook', {
          body: {
            business_id: newProfile.id,
            action: 'new_profile_created'
          }
        }).catch(err => logger.warn('Edge function hívás hiba:', err));
      }

      // The context cached "no profile" at login, so without a refresh the Copilot sent business_profile_id: null
      // for the rest of the session (live chat test 2026-10-25, Marveen 4938). A failed refresh must not block Home.
      try {
        await refreshProfile();
      } catch (err) {
        logger.warn('Profil-frissítés hiba:', err);
      }

      // Siker esetén navigálás a Home oldalra
      navigation.replace('Home');
    } catch (e: unknown) {
      setError((getErrorMessage(e)) || 'Hiba történt a mentés során.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 16 + insets.bottom }} testID="onboarding-scroll">
        <Surface style={styles.surface} elevation={2}>
          <Text variant="headlineMedium" style={styles.title}>{editMode ? 'Cégprofil szerkesztése' : 'Cégprofil létrehozása'}</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            {editMode
              ? 'Javítsd vagy egészítsd ki a cég adatait. A mentés után a következő AI keresés már az új adatokkal fut.'
              : 'Kérjük, add meg a cég alapvető adatait, hogy az AI megkereshesse számodra a leginkább megfelelő pályázatokat!'}
          </Text>

          <TextInput
            label="Cégnév *"
            value={form.company_name}
            onChangeText={(text) => {
              setForm({ ...form, company_name: text });
              clearFieldError('company_name');
            }}
            style={styles.input}
            mode="outlined"
            error={!!fieldErrors.company_name}
          />
          <FieldError message={fieldErrors.company_name} />

          <TextInput
            label="Adószám"
            value={form.tax_number}
            onChangeText={(text) => {
              setForm({ ...form, tax_number: text });
              lookupVies(text, form.company_name);
            }}
            onBlur={() => {
              setTaxTouched(true);
              lookupVies(form.tax_number, form.company_name);
            }}
            style={styles.input}
            mode="outlined"
            keyboardType="numeric"
          />
          {taxWarning ? (
            <HelperText type="info" visible style={styles.taxWarning} testID="onboarding-tax-warning">
              {taxWarning}
            </HelperText>
          ) : null}
          {viesHint ? (
            <Text variant="bodySmall" style={styles.viesHint} accessibilityLabel="VIES találat">
              {viesHint}
            </Text>
          ) : null}

          <TextInput
            label="Főtevékenység (TEÁOR)"
            value={form.industry_code}
            onChangeText={(text) => setForm({ ...form, industry_code: text })}
            style={styles.input}
            mode="outlined"
          />

          <TextInput
            label="Alkalmazottak száma"
            value={form.employee_count}
            onChangeText={(text) => {
              setForm({ ...form, employee_count: text });
              clearFieldError('employee_count');
            }}
            style={styles.input}
            keyboardType="numeric"
            mode="outlined"
            error={!!fieldErrors.employee_count}
          />
          <FieldError message={fieldErrors.employee_count} />

          <TextInput
            label="Éves árbevétel (HUF)"
            value={form.yearly_revenue}
            onChangeText={(text) => {
              setForm({ ...form, yearly_revenue: text });
              clearFieldError('yearly_revenue');
            }}
            style={styles.input}
            keyboardType="numeric"
            mode="outlined"
            error={!!fieldErrors.yearly_revenue}
          />
          <FieldError message={fieldErrors.yearly_revenue} />

          <TextInput
            label="Fejlesztési célok (pl. gépbeszerzés, zöldítés)"
            value={form.goals}
            onChangeText={(text) => setForm({ ...form, goals: text })}
            style={styles.input}
            multiline
            numberOfLines={3}
            mode="outlined"
          />

          {/* Next to the button the user just pressed: a summary when a field is wrong, or the save error. */}
          {Object.keys(fieldErrors).some((k) => fieldErrors[k as keyof FieldErrors]) ? (
            <HelperText type="error" visible testID="onboarding-fix-fields">
              Javítsd a pirossal jelölt mezőt, és mentsd újra.
            </HelperText>
          ) : null}
          {error && <HelperText type="error" visible={true}>{error}</HelperText>}

          <Button 
            mode="contained" 
            onPress={handleSave} 
            loading={loading}
            disabled={loading}
            style={styles.button}
          >
            {editMode ? 'Mentés' : 'Mentés és keresés indítása'}
          </Button>
        </Surface>
      </ScrollView>
      <AdBanner />
    </View>
  );
}

type FieldErrors = Partial<Record<'company_name' | 'employee_count' | 'yearly_revenue', string>>;

/** Field-level validation of the company form; the numbers come in without spaces. */
export function validateProfileForm(companyName: string, employeeCount: string, yearlyRevenue: string): FieldErrors {
  const digitsOnly = /^\d+$/;
  const errors: FieldErrors = {};
  if (!companyName.trim()) errors.company_name = 'A cégnév megadása kötelező!';
  if (employeeCount && !digitsOnly.test(employeeCount)) errors.employee_count = 'Csak számot írj, például 5.';
  if (yearlyRevenue && !digitsOnly.test(yearlyRevenue)) errors.yearly_revenue = 'Csak számot írj forintban, például 50000000.';
  return errors;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <HelperText type="error" visible style={styles.fieldError}>
      {message}
    </HelperText>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  surface: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: 'white',
    marginBottom: 40,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: 'bold',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: '#666',
  },
  input: {
    marginBottom: 16,
  },
  fieldError: {
    marginTop: -14,
    marginBottom: 8,
  },
  taxWarning: {
    color: '#8A5300',
    marginTop: -14,
    marginBottom: 8,
  },
  viesHint: {
    color: '#2E7D32',
    marginTop: -6,
    marginBottom: 10,
  },
  button: {
    marginTop: 8,
    paddingVertical: 6,
  },
});
