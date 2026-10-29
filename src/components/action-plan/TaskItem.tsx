import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { List, Checkbox, Button, Text } from 'react-native-paper';
import { ActionTask, ActionTaskStatus } from '../../types/database';

export const TaskItem = memo(({ task, onStatusChange }: { task: ActionTask, onStatusChange: (task: ActionTask, currentStatus: ActionTaskStatus) => void }) => {
  return (
    // Up to 3 lines of title and 4 of description: one line cut "Részletes Pályáz..." (card a96dd8e2 #11).
    // Card 83c9d624: Android's default "highQuality" break strategy with hyphenation still split long
    // words mid-word ("Megfelelőség-viz|sgálat"); the title is our own Text so it wraps at spaces and
    // hyphens only (both props are Android-only, iOS already wraps at word boundaries).
    <List.Item
      title={({ ellipsizeMode, color }) => (
        <Text
          ellipsizeMode={ellipsizeMode}
          numberOfLines={3}
          textBreakStrategy="simple"
          android_hyphenationFrequency="none"
          style={[
            { color },
            styles.taskTitle,
            task.status === 'done' && styles.doneTaskTitle
          ]}
          testID={`task-title-${task.id}`}
        >
          {task.title}
        </Text>
      )}
      // Card 83c9d624: the status button used to sit in the right slot and squeezed the title into a
      // narrow column, where long words broke mid-word ("Megfelelőség-viz|sgálat"). The title now has
      // the whole row; the button goes under the description, right-aligned.
      description={() => (
        <View>
          {task.description ? (
            <Text style={styles.taskDescription} numberOfLines={4}>{task.description}</Text>
          ) : null}
          <View style={styles.statusRow}>
            <Button
              mode={task.status === 'in_progress' ? 'contained' : 'outlined'}
              onPress={() => onStatusChange(task, task.status)}
              compact
              style={[
                styles.statusButton,
                task.status === 'in_progress' && styles.inProgressButton,
                task.status === 'done' && styles.doneButton
              ]}
              labelStyle={styles.statusButtonLabel}
              testID={`task-status-button-${task.id}`}
            >
              {task.status === 'todo' ? 'Elkezd' : task.status === 'in_progress' ? 'Kész' : 'Újra'}
            </Button>
          </View>
        </View>
      )}
      descriptionNumberOfLines={4}
      left={props => (
        <View style={[props.style, styles.checkboxContainer]}>
          <Checkbox
            status={task.status === 'done' ? 'checked' : task.status === 'in_progress' ? 'indeterminate' : 'unchecked'}
            onPress={() => onStatusChange(task, task.status)}
            color="#4CAF50"
            uncheckedColor="#9E9E9E"
          />
        </View>
      )}
      style={styles.listItem}
    />
  );
});
TaskItem.displayName = 'TaskItem';

const styles = StyleSheet.create({
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
  checkboxContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  statusButton: {
    alignSelf: 'flex-end',
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
});
