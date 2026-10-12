// The real FCM sender (Web Push). Kept out of src/game so the rules never import the Firebase SDK.
import { getMessaging } from 'firebase-admin/messaging';
import type { PushSender } from '../game/push.js';

export const fcmSender: PushSender = {
  async send(batch) {
    const messaging = getMessaging();
    return Promise.all(
      batch.map(async ({ token, message }) => {
        try {
          await messaging.send({
            token,
            data: { ...message },
            webpush: { headers: { TTL: '86400', Urgency: 'high' } },
          });
          return { ok: true };
        } catch (err) {
          return { ok: false, code: (err as { code?: string }).code ?? 'unknown' };
        }
      }),
    );
  },
};
