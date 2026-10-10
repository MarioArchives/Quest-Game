// Push notifications on this device (plan edge case P11): whether the Notifications card can offer them.
import { describe, expect, it } from 'vitest';
import { detectIOS, pushSupport, type PushEnv } from './push';

const ready: PushEnv = {
  vapidKey: 'BPublicKey',
  hasNotification: true,
  hasPushManager: true,
  hasServiceWorker: true,
  isIOS: false,
  standalone: false,
  permission: 'default',
};

describe('pushSupport', () => {
  it.each([undefined, null, ''])('is off without a VAPID key (the emulators), so the card is hidden: %s', (vapidKey) => {
    expect(pushSupport({ ...ready, vapidKey })).toBe('off');
  });

  it.each(['hasNotification', 'hasPushManager', 'hasServiceWorker'] as const)('is unsupported without %s', (key) => {
    expect(pushSupport({ ...ready, [key]: false })).toBe('unsupported');
  });

  it('asks iPhone users to add the app to the Home Screen first (Safari has no PushManager there)', () => {
    expect(pushSupport({ ...ready, isIOS: true, standalone: false, hasPushManager: false })).toBe('ios-install');
    expect(pushSupport({ ...ready, isIOS: true, standalone: false })).toBe('ios-install');
  });

  it('works on an iPhone once it runs from the Home Screen', () => {
    expect(pushSupport({ ...ready, isIOS: true, standalone: true })).toBe('available');
  });

  it('is blocked when permission was denied (only phone settings can undo that)', () => {
    expect(pushSupport({ ...ready, permission: 'denied' })).toBe('blocked');
  });

  it.each(['default', 'granted', null] as const)('is available with permission %s', (permission) => {
    expect(pushSupport({ ...ready, permission })).toBe('available');
  });
});

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

describe('detectIOS', () => {
  it.each([
    ['an iPhone', IPHONE, 5, true],
    ['an iPad asking for the desktop site (it says Macintosh)', MAC, 5, true],
    ['a Mac', MAC, 0, false],
    ['an Android phone', ANDROID, 5, false],
  ])('%s', (_label, userAgent, maxTouchPoints, expected) => {
    expect(detectIOS(userAgent, maxTouchPoints)).toBe(expected);
  });
});
