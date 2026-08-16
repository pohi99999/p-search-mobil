import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { List, Checkbox, Button } from 'react-native-paper';
import { ActionTask, ActionTaskStatus } from '../../../types/database';

export const TaskItem = memo(({ task, onStatusChange }: { task: ActionTask, onStatusChange: (task: ActionTask, currentStatus: ActionTaskStatus) => void }) => {
  return (
    <List.Item
      title={task.title}
      titleStyle={[
        styles.taskTitle,
        task.status === 'done' && styles.doneTaskTitle
      ]}
      description={task.description || undefined}
      descriptionStyle={styles.taskDescription}
      left={(props: any) => (
        <View style={[props.style, styles.checkboxContainer]}>
          <Checkbox
            status={task.status === 'done' ? 'checked' : task.status === 'in_progress' ? 'indeterminate' : 'unchecked'}
            onPress={() => onStatusChange(task, task.status)}
            color="#4CAF50"
            uncheckedColor="#9E9E9E"
          />
        </View>
      )}
      right={(props: any) => (
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
        >
          {task.status === 'todo' ? 'Elkezd' : task.status === 'in_progress' ? 'Kész' : 'Újra'}
        </Button>
      )}
      style={styles.listItem}
    />
  );
});

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
});
