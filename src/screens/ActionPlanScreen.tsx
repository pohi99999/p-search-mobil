import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, Card, Button, List, Surface, MD3Colors, ProgressBar, Divider, IconButton, Snackbar, Checkbox, ActivityIndicator } from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { useActionPlan } from '../hooks/useActionPlan';
import { BusinessProfile, ActionTask, ActionTaskStatus } from '../types/database';
import { generateAndSharePDF } from '../utils/documentGenerator';
import { useInterstitialAd } from '../hooks/useInterstitialAd';

export function ActionPlanScreen({ route, navigation }: any) {
  const matchId = route?.params?.matchId;
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const { showAdIfAvailable } = useInterstitialAd();

  // Cégprofil lekérése a bejelentkezett felhasználóhoz
  useEffect(() => {
    async function fetchProfile() {
      setProfileLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data, error } = await supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Hiba a cégprofil lekérésekor:', error);
        }

        if (data) {
          setProfile(data as BusinessProfile);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setProfileLoading(false);
      }
    }

    fetchProfile();
  }, []);

  // Egyedi hook meghívása a cégprofil azonosítóval
  const { plans, tasks, loading: plansLoading, error, refetch, updateTaskStatus, generatePlanForMatch } = useActionPlan(profile?.id);

  const visiblePlans = matchId ? plans.filter(p => p.match_id === matchId) : plans;

  const handleStatusChange = async (task: ActionTask, currentStatus: ActionTaskStatus) => {
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
      alert('Nem sikerült frissíteni a feladat állapotát.');
    }
  };

  const getStatusIcon = (status: ActionTaskStatus) => {
    switch (status) {
      case 'done': return 'check-circle';
      case 'in_progress': return 'play-circle';
      default: return 'circle-outline';
    }
  };

  const getStatusColor = (status: ActionTaskStatus) => {
    switch (status) {
      case 'done': return '#4CAF50'; // Zöld
      case 'in_progress': return '#1976D2'; // Kék
      default: return '#9E9E9E'; // Szürke
    }
  };

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
        <Text variant="titleLarge" style={{ flex: 1, fontWeight: 'bold', color: '#1A237E' }}>Pályázati Felkészülés</Text>
        <Button mode="text" onPress={refetch} compact>Frissítés</Button>
      </View>

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
                    } catch (err: any) {
                      setSnackbarMessage(err.message || 'Hiba történt a generálás során.');
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
            const totalTasks = planTasks.length;
            const completedTasks = planTasks.filter(t => t.status === 'done').length;
            const progress = totalTasks > 0 ? completedTasks / totalTasks : 0;
            const percentage = Math.round(progress * 100);

            return (
              <Card key={plan.id} style={styles.card} mode="elevated">
                <Card.Content style={styles.cardHeader}>
                  <Text variant="titleMedium" style={styles.cardTitle}>{plan.title}</Text>
                  <Text variant="bodySmall" style={styles.cardSubtitle}>
                    Létrehozva: {new Date(plan.created_at).toLocaleDateString('hu-HU')}
                  </Text>
                  
                  <View style={styles.progressContainer}>
                    <View style={styles.progressLabelRow}>
                      <Text variant="labelMedium" style={styles.progressLabel}>Felkészültség állapota</Text>
                      <Text variant="labelMedium" style={styles.progressValue}>{completedTasks}/{totalTasks} ({percentage}%)</Text>
                    </View>
                    <ProgressBar 
                      progress={progress} 
                      color={progress === 1 ? '#4CAF50' : '#1976D2'} 
                      style={styles.progressBar} 
                    />
                  </View>
                </Card.Content>
                
                <Divider />

                <Card.Content style={styles.cardBody}>
                  <List.Section style={styles.listSection}>
                    {planTasks.map((task, index) => (
                      <React.Fragment key={task.id}>
                        <List.Item
                          title={task.title}
                          titleStyle={[
                            styles.taskTitle,
                            task.status === 'done' && styles.doneTaskTitle
                          ]}
                          description={task.description || undefined}
                          descriptionStyle={styles.taskDescription}
                          left={props => (
                            <View style={[props.style, styles.checkboxContainer]}>
                              <Checkbox
                                status={task.status === 'done' ? 'checked' : task.status === 'in_progress' ? 'indeterminate' : 'unchecked'}
                                onPress={() => handleStatusChange(task, task.status)}
                                color="#4CAF50"
                                uncheckedColor="#9E9E9E"
                              />
                            </View>
                          )}
                          right={props => (
                            <Button 
                              mode={task.status === 'in_progress' ? 'contained' : 'outlined'} 
                              onPress={() => handleStatusChange(task, task.status)}
                              compact
                              style={[
                                styles.statusButton,
                                task.status === 'in_progress' && styles.inProgressButton,
                                task.status === 'done' && styles.doneButton
                              ]}
                              labelStyle={styles.statusButtonLabel}
                            >
                              {task.status === 'todo' ? 'Elkezd' : task.status === 'in_progress' ? 'Kész' : 'Újra'}
                            </Button>
                          )}
                          style={styles.listItem}
                        />
                        {index < planTasks.length - 1 && <Divider style={styles.taskDivider} />}
                      </React.Fragment>
                    ))}
                    {planTasks.length === 0 && (
                      <Text style={styles.noTasksText}>
                        Nincsenek feladatok ehhez az akciótervhez.
                      </Text>
                    )}
                  </List.Section>
                </Card.Content>
                
                <Divider />
                <Card.Actions style={styles.cardActions}>
                  {plan.ai_context?.generated_document_html && (
                    <Button
                      mode="outlined"
                      icon="file-download"
                      onPress={async () => {
                        try {
                          await generateAndSharePDF(
                            plan.ai_context.generated_document_html, 
                            `${plan.title.replace(/\s+/g, '_')}_mentett.pdf`
                          );
                        } catch (err: any) {
                          alert('PDF megnyitási hiba: ' + err.message);
                        }
                      }}
                      style={[styles.pdfButton, { marginRight: 8 }]}
                    >
                      Mentett PDF
                    </Button>
                  )}
                  
                  <Button 
                    mode="contained-tonal"
                    icon="file-pdf-box"
                    loading={pdfLoading}
                    disabled={pdfLoading}
                    onPress={() => {
                      if (!profile || !plan.match_id) {
                        alert('Nem generálható dokumentum: hiányzó cégprofil vagy pályázati azonosító.');
                        return;
                      }
                      showAdIfAvailable(async () => {
                        setPdfLoading(true);
                        try {
                          // Supabase Edge Function meghívása a generált HTML tartalomért
                          const { data, error: generateError } = await supabase.functions.invoke('generate-document', {
                            body: {
                              business_profile_id: profile.id,
                              match_id: plan.match_id
                            }
                          });

                          if (generateError) throw generateError;
                          if (data?.error) throw new Error(data.error);

                          // PDF generálása és natív megosztása a visszakapott HTML stringből
                          await generateAndSharePDF(data.html, `${plan.title.replace(/\s+/g, '_')}_uzleti_terv.pdf`);
                          
                          // Újratöltjük a terveket, hogy láthatóvá váljon a letöltés gomb
                          refetch();
                        } catch (err: any) {
                          alert('PDF hiba: ' + err.message);
                        } finally {
                          setPdfLoading(false);
                        }
                      });
                    }}
                    style={styles.pdfButton}
                  >
                    {pdfLoading ? 'Generálás...' : plan.ai_context?.generated_document_html ? 'Újragenerálás' : 'PDF Generálása'}
                  </Button>
                </Card.Actions>
              </Card>
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
  card: {
    marginHorizontal: 16,
    marginVertical: 10,
    backgroundColor: 'white',
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  cardHeader: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  cardTitle: {
    fontWeight: 'bold',
    fontSize: 18,
    color: '#1A237E',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: '#757575',
    marginBottom: 12,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    color: '#5C6BC0',
    fontWeight: '500',
  },
  progressValue: {
    fontWeight: 'bold',
    color: '#1A237E',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8EAF6',
  },
  cardBody: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  listSection: {
    marginVertical: 0,
  },
  listItem: {
    paddingVertical: 8,
  },
  taskTitle: {
    fontWeight: '600',
    fontSize: 15,
    color: '#212121',
  },
  doneTaskTitle: {
    textDecorationLine: 'line-through',
    color: '#9E9E9E',
  },
  taskDescription: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  taskIcon: {
    margin: 0,
  },
  checkboxContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  taskDivider: {
    backgroundColor: '#F5F5F5',
  },
  statusButton: {
    alignSelf: 'center',
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1.2,
  },
  inProgressButton: {
    backgroundColor: '#1976D2',
    borderWidth: 0,
  },
  doneButton: {
    borderColor: '#4CAF50',
  },
  statusButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  noTasksText: {
    fontStyle: 'italic',
    color: '#9E9E9E',
    padding: 16,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#1A237E',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  cardActions: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'flex-end',
    backgroundColor: '#FAFBFD',
  },
  pdfButton: {
    borderRadius: 8,
  }
});
