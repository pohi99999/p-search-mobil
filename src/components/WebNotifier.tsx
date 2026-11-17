import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { closeNotice, subscribeNotices, type Notice } from '../lib/notify';

// Shows notify()'s messages on the web, one at a time, oldest first. On a phone notify() uses Alert.alert, so
// this renders nothing there. Pressing outside or Esc closes it like the cancel button (without its handler).
export function WebNotifier({ force = false }: { force?: boolean }) {
  const [queue, setQueue] = useState<readonly Notice[]>([]);
  useEffect(() => subscribeNotices(setQueue), []);

  if (Platform.OS !== 'web' && !force) return null;
  const notice = queue[0];
  if (!notice) return null;

  return (
    <Portal>
      <Dialog
        visible
        onDismiss={() => closeNotice(notice.id)}
        style={{ maxWidth: 440, width: '90%', alignSelf: 'center' }}
        testID="web-notice"
      >
        <Dialog.Title accessibilityRole="header" testID="web-notice-title">
          {notice.title}
        </Dialog.Title>
        {notice.message ? (
          <Dialog.Content>
            <Text variant="bodyMedium" role="alert" accessibilityLiveRegion="assertive" testID="web-notice-message">
              {notice.message}
            </Text>
          </Dialog.Content>
        ) : null}
        <Dialog.Actions>
          {notice.buttons.map((b, i) => (
            <Button
              key={`${b.text ?? 'ok'}-${i}`}
              onPress={() => closeNotice(notice.id, b)}
              contentStyle={{ minHeight: 44 }}
              testID={`web-notice-button-${i}`}
            >
              {b.text ?? 'Rendben'}
            </Button>
          ))}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
