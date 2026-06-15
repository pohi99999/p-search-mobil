import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Card, Checkbox, Button, List, Surface, MD3Colors } from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { useActionPlan } from '../hooks/useActionPlan';
import { BusinessProfile, ActionTask, ActionTaskStatus } from '../types/database';

export function ActionPlanScreen({ navigation }: any) {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

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
  const { plans, tasks, loading: plansLoading, error, refetch, updateTaskStatus } = useActionPlan(profile?.id);

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
      case 'done': return 'checkbox-marked-circle-outline';
      case 'in_progress': return 'clock-outline';
      default: return 'checkbox-blank-circle-outline';
    }
  };

  const getStatusColor = (status: ActionTaskStatus) => {
    switch (status) {
      case 'done': return MD3Colors.error40; // zöldes vagy kék, de a Paper alap színeit használhatjuk
      case 'in_progress': return '#1976D2';
      default: return '#757575';
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
        <Text variant="titleLarge" style={{ flex: 1 }}>Pályázati Felkészülés</Text>
        <Button mode="outlined" onPress={refetch} compact>Frissítés</Button>
      </View>

      {error && (
        <Surface style={styles.errorBanner} elevation={1}>
          <Text style={{ color: 'red' }}>Hiba: {error}</Text>
        </Surface>
      )}

      {plans.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text variant="titleMedium" style={{ textAlign: 'center', marginBottom: 8 }}>
            Nincs aktív akcióterved
          </Text>
          <Text variant="bodyMedium" style={{ textAlign: 'center', color: '#666', marginBottom: 16 }}>
            Jelölj meg egy számodra érdekes pályázatot a főképernyőn, hogy elkészíthessük hozzá a felkészülési tervet!
          </Text>
          <Button mode="contained" onPress={() => navigation.navigate('Home')}>
            Pályázatok keresése
          </Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {plans.map((plan) => {
            const planTasks = tasks[plan.id] || [];
            return (
              <Card key={plan.id} style={styles.card}>
                <Card.Title 
                  title={plan.title} 
                  subtitle="Aktív Akcióterv"
                />
                <Card.Content>
                  <Text variant="bodySmall" style={{ marginBottom: 12, color: '#666' }}>
                    Létrehozva: {new Date(plan.created_at).toLocaleDateString('hu-HU')}
                  </Text>
                  
                  <List.Section title="Teendők listája">
                    {planTasks.map((task) => (
                      <List.Item
                        key={task.id}
                        title={task.title}
                        description={task.description || 'Nincs leírás megadva'}
                        left={props => (
                          <List.Icon 
                            {...props} 
                            icon={getStatusIcon(task.status)}
                            color={getStatusColor(task.status)}
                          />
                        )}
                        right={props => (
                          <Button 
                            mode="text" 
                            onPress={() => handleStatusChange(task, task.status)}
                          >
                            {task.status === 'todo' ? 'Indítás' : task.status === 'in_progress' ? 'Befejezés' : 'Újra'}
                          </Button>
                        )}
                      />
                    ))}
                    {planTasks.length === 0 && (
                      <Text style={{ fontStyle: 'italic', color: '#888', paddingLeft: 16 }}>
                        Nincsenek feladatok ehhez az akciótervhez.
                      </Text>
                    )}
                  </List.Section>
                </Card.Content>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
    padding: 16,
    backgroundColor: 'white',
    elevation: 2,
    marginBottom: 8,
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
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: 'white',
  }
});
