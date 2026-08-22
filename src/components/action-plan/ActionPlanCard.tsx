import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Card, Button, List, ProgressBar, Divider } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { ActionPlan, ActionTask, ActionTaskStatus, BusinessProfile } from '../../types/database';
import { generateAndSharePDF } from '../../utils/documentGenerator';
import { logger } from '../../utils/logger';
import { TaskItem } from './TaskItem';

interface ActionPlanCardProps {
  plan: ActionPlan;
  planTasks: ActionTask[];
  planStats: Record<string, { totalTasks: number; completedTasks: number; progress: number; percentage: number }>;
  handleStatusChange: (task: ActionTask, currentStatus: ActionTaskStatus) => void;
  profile: BusinessProfile | null;
  pdfLoading: boolean;
  setPdfLoading: (loading: boolean) => void;
  showAdIfAvailable: (callback: () => Promise<void>) => void;
  refetch: () => void;
}

export function ActionPlanCard({
  plan,
  planTasks,
  planStats,
  handleStatusChange,
  profile,
  pdfLoading,
  setPdfLoading,
  showAdIfAvailable,
  refetch
}: ActionPlanCardProps) {
  const { totalTasks, completedTasks, progress, percentage } = planStats[plan.id] || { totalTasks: 0, completedTasks: 0, progress: 0, percentage: 0 };

  return (
    <Card style={styles.card} mode="elevated">
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
              <TaskItem task={task} onStatusChange={handleStatusChange} />
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
                  plan.ai_context.generated_document_html!,
                  `${plan.title.replace(/\s+/g, '_')}_mentett.pdf`
                );
              } catch (err: unknown) {
                logger.error('PDF opening error:', err);
                Alert.alert('Hiba', 'Váratlan hiba történt a PDF megnyitásakor. Kérjük, próbálja újra később.');
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
              Alert.alert('Hiba', 'Nem generálható dokumentum: hiányzó cégprofil vagy pályázati azonosító.');
              return;
            }
            showAdIfAvailable(async () => {
              setPdfLoading(true);
              try {
                const { data, error: generateError } = await supabase.functions.invoke('generate-document', {
                  body: {
                    business_profile_id: profile.id,
                    match_id: plan.match_id
                  }
                });

                if (generateError) throw generateError;
                if (data?.error) throw new Error(data.error);

                await generateAndSharePDF(data.html, `${plan.title.replace(/\s+/g, '_')}_uzleti_terv.pdf`);

                refetch();
              } catch (err: unknown) {
                logger.error('PDF generation error:', err);
                Alert.alert('Hiba', 'Váratlan hiba történt a PDF generálásakor. Kérjük, próbálja újra később.');
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
}

const styles = StyleSheet.create({
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
  taskDivider: {
    backgroundColor: '#F5F5F5',
  },
  noTasksText: {
    fontStyle: 'italic',
    color: '#9E9E9E',
    padding: 16,
    textAlign: 'center',
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
