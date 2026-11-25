import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Button, Dialog, Modal, Portal, Text, useTheme } from 'react-native-paper';
import { closeNotice, subscribeNotices, type Notice } from '../lib/notify';

// Shows notify()'s messages on the web, one at a time, oldest first. On a phone notify() uses Alert.alert, so
// this renders nothing there. Pressing outside or Esc closes it like the cancel button (without its handler).
//
// Round 6 (Kenshin 9154): a Modal shaped like Paper's Dialog, not the Dialog itself. The Dialog gives its Modal no
// way to name the backdrop, so a screen reader heard the backdrop as "Close modal", in English. The look is the
// Dialog's (radius 7 x roundness, elevation level 3, the title's 24 px top margin).
export const NOTICE_BACKDROP_LABEL = 'Értesítés bezárása';

export function WebNotifier({ force = false }: { force?: boolean }) {
  const theme = useTheme();
  const [queue, setQueue] = useState<readonly Notice[]>([]);
  useEffect(() => subscribeNotices(setQueue), []);

  if (Platform.OS !== 'web' && !force) return null;
  const notice = queue[0];
  if (!notice) return null;

  return (
    <Portal>
      <Modal
        visible
        onDismiss={() => closeNotice(notice.id)}
        overlayAccessibilityLabel={NOTICE_BACKDROP_LABEL}
        contentContainerStyle={[styles.box, { borderRadius: 7 * theme.roundness, backgroundColor: theme.colors.elevation.level3 }]}
        testID="web-notice"
      >
        <Dialog.Title accessibilityRole="header" style={styles.title} testID="web-notice-title">
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
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  box: { maxWidth: 440, width: '90%', alignSelf: 'center', marginHorizontal: 26 },
  title: { marginTop: 24 },
});
