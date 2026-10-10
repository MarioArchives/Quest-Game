// Push notifications on this device: can it get them, and is it an iPhone that needs installing first.

export type PushSupport = 'off' | 'unsupported' | 'ios-install' | 'blocked' | 'available';

export interface PushEnv {
  /** The public Web Push (VAPID) key; missing in the emulators. */
  vapidKey: string | null | undefined;
  hasNotification: boolean;
  hasPushManager: boolean;
  hasServiceWorker: boolean;
  isIOS: boolean;
  /** Running from the Home Screen (display-mode: standalone / navigator.standalone). */
  standalone: boolean;
  permission: 'default' | 'granted' | 'denied' | null;
}

export function pushSupport(env: PushEnv): PushSupport {
  if (!env.vapidKey) return 'off';
  // Before the PushManager check: iOS Safari only has it once the app is on the Home Screen.
  if (env.isIOS && !env.standalone) return 'ios-install';
  if (!env.hasNotification || !env.hasPushManager || !env.hasServiceWorker) return 'unsupported';
  if (env.permission === 'denied') return 'blocked';
  return 'available';
}

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac, so touch points tell them apart). */
export function detectIOS(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPod|iPad/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}
