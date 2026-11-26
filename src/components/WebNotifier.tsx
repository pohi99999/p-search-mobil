import React, { useEffect, useRef, useState } from 'react';
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
// role="dialog" element that is modal and is named by the title and described by the message.
export const NOTICE_TITLE_ID = 'web-notice-title-text';
export const NOTICE_MESSAGE_ID = 'web-notice-message-text';
/** The dialog element's id on the web (nativeID), where the focus handling finds it. */
export const NOTICE_DIALOG_ID = 'web-notice-dialog-root';

// Round 6 follow-up (Ellenőr 9301 remarks 1 and 2): the focus stayed on the page behind the notice, and Tab walked out
// of it; and the message was both role="alert" and the dialog's description, so a screen reader could say it twice.
// Now the notice takes the focus (its first button) when it opens, Tab and Shift+Tab wrap inside it, and the focus
// goes back where it was when it closes. The dialog's name and description are read when the focus enters it, so the
// message is no longer an alert of its own.
const FOCUSABLE = 'button:not([disabled]), [role="button"]:not([aria-disabled="true"]), a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * Where Tab should move the focus inside the open notice, or null to let the browser move it: from outside the notice
 * to its first (Shift: last) item, and around at both ends.
 */
export function trapTab<T>(items: readonly T[], active: T | null, shift: boolean): T | null {
  if (items.length === 0) return null;
  const i = active === null ? -1 : items.indexOf(active);
  if (i === -1) return shift ? items[items.length - 1] : items[0];
  if (shift && i === 0) return items[items.length - 1];
  if (!shift && i === items.length - 1) return items[0];
  return null;
}

export function WebNotifier({ force = false }: { force?: boolean }) {
  const theme = useTheme();
  const [queue, setQueue] = useState<readonly Notice[]>([]);
  useEffect(() => subscribeNotices(setQueue), []);

  const notice = queue[0];
  const noticeId = notice?.id;
  const onWeb = Platform.OS === 'web' || force;
  // The last element the user focused outside the notice. Measured in the browser: the sign-in button is disabled
  // while it loads, so the focus has fallen to the body by the time a "Hiba bejelentkezéskor" notice opens; the notice
  // gives the focus back to this one instead.
  const lastFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!onWeb || typeof document === 'undefined') return undefined;
    const doc = document;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target !== doc.body && !doc.getElementById?.(NOTICE_DIALOG_ID)?.contains(target)) lastFocused.current = target;
    };
    doc.addEventListener('focusin', onFocusIn);
    return () => doc.removeEventListener('focusin', onFocusIn);
  }, [onWeb]);
  useEffect(() => {
    if (!onWeb || noticeId === undefined || typeof document === 'undefined') return undefined;
    // The document this notice opened in; the cleanup uses the same one.
    const doc = document;
    const items = () => Array.from(doc.getElementById?.(NOTICE_DIALOG_ID)?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const active = doc.activeElement as HTMLElement | null;
    const before = active && active !== doc.body ? active : lastFocused.current;
    // Measured in the browser: when this runs, Paper's portal has not put the dialog into the DOM yet, so the first
    // focus is tried again on the next frames (up to about half a second) until its button is there.
    let frame: number | undefined;
    let tries = 0;
    const focusFirst = () => {
      const first = items()[0];
      if (first) {
        first.focus();
        return;
      }
      if (tries++ < 30 && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(focusFirst);
    };
    focusFirst();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNotice(noticeId);
      if (e.key === 'Tab') {
        const target = trapTab(items(), doc.activeElement as HTMLElement | null, e.shiftKey);
        if (target) {
          e.preventDefault();
          target.focus();
        }
      }
    };
    doc.addEventListener('keydown', onKeyDown);
    return () => {
      if (frame !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      doc.removeEventListener('keydown', onKeyDown);
      if (before && typeof before.focus === 'function' && doc.contains?.(before)) before.focus();
    };
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
          nativeID={NOTICE_DIALOG_ID}
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
              <Text variant="bodyMedium" nativeID={NOTICE_MESSAGE_ID} testID="web-notice-message">
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
