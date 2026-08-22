import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Button, Surface, Snackbar, ActivityIndicator, Banner, IconButton } from 'react-native-paper';
import { useProfile } from '../context/ProfileContext';
import { useActionPlan } from '../hooks/useActionPlan';
import { ActionTask, ActionTaskStatus } from '../types/database';
import { useInterstitialAd } from '../hooks/useInterstitialAd';

import type { ActionPlanScreenProps } from "../types/navigation";
import { logger } from '../utils/logger';
import { ActionPlanCard } from '../components/action-plan/ActionPlanCard';

export function ActionPlanScreen({ route, navigation }: ActionPlanScreenProps) {
  const matchId = route?.params?.matchId;
  const { profile, loading: profileLoading } = useProfile();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [ocrConfidence, setOcrConfidence] = useState<'high' | 'medium' | 'low' | null>(null);

  const { showAdIfAvailable } = useInterstitialAd();



  // Egyedi hook meghívása a cégprofil azonosítóval
  const { plans, tasks, loading: plansLoading, error, refetch, updateTaskStatus, generatePlanForMatch } = useActionPlan(profile?.id);

  const visiblePlans = matchId ? plans.filter(p => p.match_id === matchId) : plans;

  const handleStatusChange = useCallback(async (task: ActionTask, currentStatus: ActionTaskStatus) => {
    // Váltogatás: todo -> in_progress -> done -> todo
    let newStatus: ActionTaskStatus = 'todo';
    if (currentStatus === 'todo') {
      newStatus = 'in_progress';
    } else if (currentStatus === 'in_progress') {
      newStatus = 'done';
    } else {
      newStatus = 'todo';
    }

    try {
      await updateTaskStatus(task.id, task.plan_id, newStatus);
    } catch (err) {
      Alert.alert('Hiba', 'Nem sikerült frissíteni a feladat állapotát.');
    }
  }, [updateTaskStatus]);


  const planStats = useMemo(() => {
    return visiblePlans.reduce((stats, plan) => {
      const planTasks = tasks[plan.id] || [];
      const totalTasks = planTasks.length;

      const completedTasks = planTasks.reduce(
        (acc, task) => acc + (task.status === 'done' ? 1 : 0),
        0
      );

      const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;
      const percentage = Math.round(progress * 100);

      stats[plan.id] = { totalTasks, completedTasks, progress, percentage };
      return stats;
    }, {} as Record<string, { totalTasks: number; completedTasks: number; progress: number; percentage: number }>);
  }, [visiblePlans, tasks]);

  const isLoading = profileLoading || plansLoading;

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={{ marginTop: 16 }}>Akciótervek betöltése...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centerContainer}>
        <Text variant="bodyLarge" style={{ marginBottom: 16 }}>Nincs kitöltött cégprofilod.</Text>
        <Button mode="contained" onPress={() => navigation.replace('Onboarding')}>
          Onboarding kitöltése
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
          testID="action-plan-back-button"
        />
        <Text variant="titleLarge" style={{ flex: 1, fontWeight: 'bold', color: '#1A237E' }}>Pályázati Felkészülés</Text>
        <Button mode="text" onPress={refetch} compact>Frissítés</Button>
      </View>

      <Banner
        visible={ocrConfidence === 'low'}
        actions={[
          {
            label: 'Újra fotózom',
            onPress: () => setOcrConfidence(null),
          },
        ]}
        icon="alert"
      >
        A dokumentum minősége nem megfelelő. Kérjük, tölts fel egy tisztább, olvashatóbb mérleget vagy főkönyvet!
      </Banner>

      {error && (
        <Surface style={styles.errorBanner} elevation={1}>
          <Text style={{ color: 'red' }}>Hiba: {error}</Text>
        </Surface>
      )}


      {visiblePlans.length === 0 ? (
        <View style={styles.emptyContainer}>
          {matchId ? (
            generating ? (
              <>
                <ActivityIndicator size="large" color="#1A237E" style={{ marginBottom: 16 }} />
                <Text variant="titleMedium" style={{ textAlign: 'center', marginBottom: 8, fontWeight: 'bold' }}>
                  Akcióterv generálása folyamatban...
                </Text>
                <Text variant="bodyMedium" style={{ textAlign: 'center', color: '#666' }}>
                  A Gemini AI elemzi a pályázatot és a cégprofilodat. Ez eltarthat egy kis ideig.
                </Text>
              </>
            ) : (
              <>
                <Text variant="titleMedium" style={{ textAlign: 'center', marginBottom: 8, fontWeight: 'bold' }}>
                  Ehhez a pályázathoz még nincs akcióterv
                </Text>
                <Text variant="bodyMedium" style={{ textAlign: 'center', color: '#666', marginBottom: 24 }}>
                  Kattints az alábbi gombra, hogy a Gemini AI elkészítse számodra a személyre szabott felkészülési tervet!
                </Text>
                <Button
                  mode="contained"
                  style={styles.primaryButton}
                  onPress={async () => {
                    if (!profile || !matchId) return;
                    setGenerating(true);
                    try {
                      await generatePlanForMatch(profile.id, matchId);
                      setSnackbarMessage('Akcióterv sikeresen legenerálva!');
                      setSnackbarVisible(true);
                    } catch (err: unknown) {
                      logger.error('Hiba az akcióterv generálása során:', err);
                      setSnackbarMessage('Hiba történt a generálás során. Kérjük, próbálja újra később.');
                      setSnackbarVisible(true);
                    } finally {
                      setGenerating(false);
                    }
                  }}
                >
                  Akcióterv Generálása
                </Button>
              </>
            )
          ) : (
            <>
              <Text variant="titleMedium" style={{ textAlign: 'center', marginBottom: 8, fontWeight: 'bold' }}>
                Nincs aktív akcióterved
              </Text>
              <Text variant="bodyMedium" style={{ textAlign: 'center', color: '#666', marginBottom: 24 }}>
                Jelölj meg egy számodra érdekes pályázatot a főképernyőn, hogy elkészíthessük hozzá a felkészülési tervet!
              </Text>
              <Button mode="contained" style={styles.primaryButton} onPress={() => navigation.navigate('Home')}>
                Pályázatok keresése
              </Button>
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {visiblePlans.map((plan) => {
            const planTasks = tasks[plan.id] || [];
            return (
              <ActionPlanCard
                key={plan.id}
                plan={plan}
                planTasks={planTasks}
                planStats={planStats}
                handleStatusChange={handleStatusChange}
                profile={profile}
                pdfLoading={pdfLoading}
                setPdfLoading={setPdfLoading}
                showAdIfAvailable={showAdIfAvailable}
                refetch={refetch}
              />
            );
          })}
        </ScrollView>
      )}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    elevation: 1,
  },
  errorBanner: {
    padding: 12,
    backgroundColor: '#FFEBEE',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
  },
  scrollContent: {
    paddingBottom: 24,
    paddingTop: 8,
  },
  primaryButton: {
    backgroundColor: '#1A237E',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
});