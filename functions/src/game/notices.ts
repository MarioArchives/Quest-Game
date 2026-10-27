// Case updates in the police chat (Telegram line): a push to a player with a verified Telegram line goes to the police
// script as a `notice` order instead, while the line takes notices; everyone else keeps the push. The script posts it
// with the case-update prefix and deletes the earlier ones.
import { LINE_OFFLINE_MS, isTelegramSid } from '../shared/phone.js';
import type { LineBeat, LineNoticeOrder, PlayerPhone, Settings } from '../shared/types.js';
import type { Db } from './context.js';
import { loadSettings } from './guards.js';
import { recipientsOf, sendPush, type PushMessage, type PushPlan, type PushSender } from './push.js';
import { millis, toTs } from './util.js';

/** A notice's text: what the push would have said ("Title: body"). */
export function noticeText(message: PushMessage): string {
  return message.body ? `${message.title}: ${message.body}` : message.title;
}

/** Whether the police chat takes case updates now: the setting is on, and the script's heartbeat is alive with 'notices'. */
export function noticesOpen(settings: Pick<Settings, 'policeNotices'>, beat: LineBeat | null | undefined, nowMs: number): boolean {
  if (!settings.policeNotices || !beat) return false;
  return nowMs - millis(beat.seenAt) <= LINE_OFFLINE_MS && (beat.features ?? []).includes('notices');
}

/** The number to post a player's case updates to: a verified line whose test went over Telegram (TG-); else null. */
export function noticeNumber(phone: PlayerPhone | null | undefined): string | null {
  return phone && phone.status === 'verified' && isTelegramSid(phone.test?.sid) ? phone.number : null;
}

/**
 * Sends a push plan: while the chat takes notices, every recipient with a Telegram line gets a `notice` order instead
 * (a GM-only plan always stays a push), and the rest get the push. Never throws.
 */
export async function deliverPush(db: Db, sender: PushSender, plan: PushPlan, now: Date): Promise<{ sent: number; pruned: number; notices: number }> {
  try {
    if (plan.to !== 'gms') {
      const beat = (await db.doc('game/line').get()).data() as LineBeat | undefined;
      if (noticesOpen(await loadSettings(db), beat, now.getTime())) {
        const text = noticeText(plan.message);
        const rest: string[] = [];
        let notices = 0;
        for (const uid of await recipientsOf(db, plan)) {
          const to = noticeNumber((await db.doc(`phones/${uid}`).get()).data() as PlayerPhone | undefined);
          if (!to) {
            rest.push(uid);
            continue;
          }
          const order: LineNoticeOrder = { kind: 'notice', to, text, status: 'new', createdAt: toTs(now) };
          await db.collection('lineOrders').doc().set(order);
          notices++;
        }
        const out = rest.length ? await sendPush(db, sender, { ...plan, to: rest }) : { sent: 0, pruned: 0 };
        return { ...out, notices };
      }
    }
  } catch {
    // Fall through to a plain push: a broken notice path must not lose the update.
  }
  return { ...(await sendPush(db, sender, plan)), notices: 0 };
}
