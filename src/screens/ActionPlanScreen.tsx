import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Button, Surface, Snackbar, ActivityIndicator, Banner, IconButton } from 'react-native-paper';
import { useProfile } from '../context/ProfileContext';
import { useActionPlan } from '../hooks/useActionPlan';
import { ActionTask, ActionTaskStatus } from '../types/database';
import { useInterstitialAd } from '../hooks/useInterstitialAd';

import type { ActionPlanScreenProps } from "../types/navigation";
import { logger } from '../utils/logger';
import { ActionPlanCard } from '../components/action-plan/ActionPlanCard';
import { useProfileGate } from '../hooks/useProfileGate';


const STATUS_TRANSITION: Record<ActionTaskStatus, ActionTaskStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
};

export function ActionPlanScreen({ route, navigation }: ActionPlanScreenProps) {
  const matchId = route?.params?.matchId;
  const { profile, loading: profileLoading } = useProfile();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [ocrConfidence, setOcrConfidence] = useState<'high' | 'medium' | 'low' | null>(null);

  const { showAdIfAvailable } = useInterstitialAd();
  // An empty company profile: ask for the key fields before the plan is generated (card 431a496e).
  const { gate: profileGate, dialog: profileDialog } = useProfileGate(profile);



  // Egyedi hook meghívása a cégprofil azonosítóval
  const { plans, tasks, loading: plansLoading, error, refetch, updateTaskStatus, generatePlanForMatch } = useActionPlan(profile?.id);

  const visiblePlans = matchId ? plans.filter(p => p.match_id === matchId) : plans;

  // Card [J]: the hook's error (load, task update or generation; often a raw server text) is no longer shown
  // on screen, so it goes to the log here.
  useEffect(() => {
    if (error) logger.warn('Akcióterv hiba:', error);
  }, [error]);

  const handleStatusChange = useCallback(async (task: ActionTask, currentStatus: ActionTaskStatus) => {
    const newStatus = STATUS_TRANSITION[currentStatus] ?? 'todo';

    try {
      await updateTaskStatus(task.id, task.plan_id, newStatus);
    } catch {
      Alert.alert('Hiba', 'Nem sikerült frissíteni a feladat állapotát.');
    }
  }, [updateTaskStatus]);


  const planStats = useMemo(() => {
    const stats: Record<string, { totalTasks: number; completedTasks: number; progress: number; percentage: number }> = {};
    for (let i = 0; i < visiblePlans.length; i++) {
      const plan = visiblePlans[i];
      const planTasks = tasks[plan.id];
      let totalTasks = 0;
      let completedTasks = 0;

      if (planTasks) {
        totalTasks = planTasks.length;
        for (let j = 0; j < totalTasks; j++) {
          if (planTasks[j].status === 'done') {
            completedTasks++;
          }
        }
      }

      const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;
      const percentage = Math.round(progress * 100);

      stats[plan.id] = { totalTasks, completedTasks, progress, percentage };
    }
    return stats;
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
          accessibilityLabel="Vissza"
        />
        <Text variant="titleLarge" style={{ flex: 1, fontWeight: 'bold', color: '#1A237E' }}>Pályázati felkészülés</Text>
        <Button mode="text" onPress={refetch} compact>Frissítés</Button>
      </View>

      {/* Card 269fdd5f: the Copilot chat had no entry point since 9bd7505 (2026-08-17). From here it opens
          on the match of this screen, so the answers refer to that grant (chat-with-gemini match_id). */}
      {matchId ? (
        <View style={styles.copilotRow}>
          <Button
            mode="outlined"
            icon="robot-outline"
            onPress={() => navigation.navigate('CopilotChat', { matchId })}
            testID="ask-copilot-button"
            style={styles.copilotButton}
          >
            Kérdezz a Copilottól
          </Button>
        </View>
      ) : null}

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
          {/* Card [J]: the raw error (often an English server text) stays in the log, not on screen. */}
          <Text style={{ color: '#B71C1C' }}>Valami nem sikerült az akciótervekkel. Koppints a Frissítés gombra, vagy próbáld újra később.</Text>
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
                  Az AI elemzi a pályázatot és a cégprofilodat. Ez eltarthat egy kis ideig.
                </Text>
              </>
            ) : (
              <>
                <Text variant="titleMedium" style={{ textAlign: 'center', marginBottom: 8, fontWeight: 'bold' }}>
                  Ehhez a pályázathoz még nincs akcióterv
                </Text>
                <Text variant="bodyMedium" style={{ textAlign: 'center', color: '#666', marginBottom: 24 }}>
                  Kattints az alábbi gombra, hogy az AI elkészítse számodra a személyre szabott felkészülési tervet!
                </Text>
                <Button
                  mode="contained"
                  style={styles.primaryButton}
                  onPress={() => profileGate(async () => {
                    if (!profile || !matchId) return;
                    setGenerating(true);
                    try {
                      await generatePlanForMatch(profile.id, matchId);
                      setSnackbarMessage('Akcióterv sikeresen legenerálva!');
                      setSnackbarVisible(true);
                    } catch (err: unknown) {
                      if ((err as { proRequired?: boolean })?.proRequired) {
                        // Pro feature: send the user to the Paywall (message already set by the hook).
                        navigation.navigate('Paywall');
                        return;
                      }
                      logger.error('Hiba az akcióterv generálása során:', err);
                      setSnackbarMessage('Nem sikerült elkészíteni az akciótervet. Kérlek, próbáld újra később.');
                      setSnackbarVisible(true);
                    } finally {
                      setGenerating(false);
                    }
                  })}
                >
                  Akcióterv készítése
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
                onProRequired={() => navigation.navigate('Paywall')}
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
      {profileDialog}
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
  copilotRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  copilotButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
  },
  primaryButton: {
    backgroundColor: '#1A237E',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
});