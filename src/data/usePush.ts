// This device's notifications: get a token from FCM, hand it to the server, and take it back.
import { removePushToken, savePushToken } from '../api';
import { backend } from '../backend';
import { detectIOS, pushSupport, type PushEnv, type PushSupport } from '../lib/push';

/** Per-device convenience only: whether this browser asked for notifications. The server holds the real token. */
const ON_KEY = 'fq-push-on';

export function currentPushEnv(): PushEnv {
  const hasNotification = typeof Notification !== 'undefined';
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  return {
    // Any value will do: pushSupport only asks whether the backend can do push (not in the emulators or the mock).
    vapidKey: backend().push ? 'on' : undefined,
    hasNotification,
    hasPushManager: typeof window !== 'undefined' && 'PushManager' in window,
    hasServiceWorker: Boolean(nav && 'serviceWorker' in nav),
    isIOS: detectIOS(nav?.userAgent ?? '', nav?.maxTouchPoints ?? 0),
    standalone:
      (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
      Boolean((nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone),
    permission: hasNotification ? Notification.permission : null,
  };
}

export function currentPushSupport(): PushSupport {
  return pushSupport(currentPushEnv());
}

export function isPushOn(): boolean {
  try {
    return localStorage.getItem(ON_KEY) === '1';
  } catch {
    return false;
  }
}

function setPushOn(on: boolean) {
  try {
    if (on) localStorage.setItem(ON_KEY, '1');
    else localStorage.removeItem(ON_KEY);
  } catch {
    // Private mode or blocked storage: the switch simply won't remember.
  }
}

/** This device's FCM token, or null if it can't get one right now. */
async function deviceToken(): Promise<string | null> {
  return backend().push?.token() ?? null;
}

/** Asks for permission (call from a tap), then registers this device. Returns false if the user said no. */
export async function enablePush(): Promise<boolean> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const token = await deviceToken();
  if (!token) throw new Error('No notification token');
  await savePushToken({ token });
  setPushOn(true);
  return true;
}

/** Forgets this device on the server and locally. Best effort: it never throws, so sign-out always works. */
export async function forgetThisDevice(): Promise<void> {
  setPushOn(false);
  try {
    if (currentPushSupport() !== 'available') return;
    const token = await deviceToken();
    if (token) await removePushToken({ token });
  } catch {
    // Nothing to do: the server prunes tokens FCM reports as dead.
  }
}

/** Tokens rotate, so re-register a switched-on device each time the app starts. */
export async function refreshPush(): Promise<void> {
  if (!isPushOn() || currentPushSupport() !== 'available') return;
  try {
    const token = await deviceToken();
    if (token) await savePushToken({ token });
  } catch {
    // Try again next time the app starts.
  }
}
