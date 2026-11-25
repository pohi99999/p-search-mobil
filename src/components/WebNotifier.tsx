import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, Dialog, Modal, Portal, Text, useTheme } from 'react-native-paper';
import { closeNotice, subscribeNotices, type Notice } from '../lib/notify';

// Shows notify()'s messages on the web, one at a time, oldest first. On a phone notify() uses Alert.alert, so
// this renders nothing there. Pressing outside or Esc closes it like the cancel button (without its handler).
// Measured in the browser (round 6 follow-up): Esc did NOT close it, before the Modal change either; the comment
// said it did. Paper's Modal only listens for the Android back button. The keydown listener below is what closes it.
//
// Round 6 (Kenshin 9154): a Modal shaped like Paper's Dialog, not the Dialog itself. The Dialog gives its Modal no
// way to name the backdrop, so a screen reader heard the backdrop as "Close modal", in English. The look is the
// Dialog's (radius 7 x roundness, elevation level 3, the title's 24 px top margin).
export const NOTICE_BACKDROP_LABEL = 'Értesítés bezárása';

// Round 6 follow-up (Ellenőr 9246 remark 2): the notice was not announced as a dialog. The Modal gives its content no
// role, so a screen reader met a title, a message and buttons in a plain box. The three are now wrapped in a
// role="dialog" element that is modal and is named by the title and described by the message. (Not measured here:
// the focus trap and the Esc key; the notice still closes on Esc and on a press outside, as before.)
export const NOTICE_TITLE_ID = 'web-notice-title-text';
export const NOTICE_MESSAGE_ID = 'web-notice-message-text';

export function WebNotifier({ force = false }: { force?: boolean }) {
  const theme = useTheme();
  const [queue, setQueue] = useState<readonly Notice[]>([]);
  useEffect(() => subscribeNotices(setQueue), []);

  const notice = queue[0];
  const noticeId = notice?.id;
  const onWeb = Platform.OS === 'web' || force;
  useEffect(() => {
    if (!onWeb || noticeId === undefined || typeof document === 'undefined') return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNotice(noticeId);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onWeb, noticeId]);

  if (!onWeb) return null;
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
        <View
          role="dialog"
          aria-modal
          aria-labelledby={NOTICE_TITLE_ID}
          aria-describedby={notice.message ? NOTICE_MESSAGE_ID : undefined}
          testID="web-notice-dialog"
        >
          <Dialog.Title accessibilityRole="header" nativeID={NOTICE_TITLE_ID} style={styles.title} testID="web-notice-title">
            {notice.title}
          </Dialog.Title>
          {notice.message ? (
            <Dialog.Content>
              <Text variant="bodyMedium" role="alert" accessibilityLiveRegion="assertive" nativeID={NOTICE_MESSAGE_ID} testID="web-notice-message">
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
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  box: { maxWidth: 440, width: '90%', alignSelf: 'center', marginHorizontal: 26 },
  title: { marginTop: 24 },
});
