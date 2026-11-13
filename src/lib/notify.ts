import { Alert, Platform, type AlertButton } from 'react-native';

// One place for the app's messages. On a phone it is Alert.alert, unchanged. On the web react-native-web's
// Alert.alert shows nothing (measured 2026-11-13 on p-search-mobil.vercel.app: an empty sign-in showed no text,
// no dialog), so every error there was silent. On the web the message goes into a queue that <WebNotifier />
// shows as a dialog, with the same buttons.

export type Notice = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
};

type Listener = (queue: readonly Notice[]) => void;

let nextId = 1;
let queue: Notice[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(queue);
}

/** Same arguments as Alert.alert(title, message, buttons, options); on a phone they pass through unchanged. */
export function notify(...args: Parameters<typeof Alert.alert>): void {
  if (Platform.OS !== 'web') {
    Alert.alert(...args);
    return;
  }
  const [title, message, buttons] = args;
  queue = [...queue, { id: nextId++, title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'Rendben' }] }];
  emit();
}

/** The web dialog listens here; returns the unsubscribe function. */
export function subscribeNotices(listener: Listener): () => void {
  listeners.add(listener);
  listener(queue);
  return () => {
    listeners.delete(listener);
  };
}

/** Closes the shown notice, then runs the pressed button's handler (as Alert.alert does). */
export function closeNotice(id: number, button?: AlertButton): void {
  queue = queue.filter((n) => n.id !== id);
  emit();
  button?.onPress?.();
}

/** Tests only. */
export function resetNoticesForTest(): void {
  queue = [];
  nextId = 1;
  emit();
}
