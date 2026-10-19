import { useState } from 'react';
import { friendlyError } from '../../api';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { currentPushSupport, enablePush, forgetThisDevice, isPushOn } from '../../data/usePush';
import type { PushSupport } from '../../lib/push';
import { pack, t } from '../../pack';

type Kinds = NonNullable<typeof pack.pushKinds>;

/** What a player hears about, in plain words, from the pack's `pushKinds` (everything, as before, when it lists none). */
function playerHears(kinds: Kinds | undefined): string {
  if (!kinds) return `${t.sideQuest.many}, votes, ${t.witness.one} requests and announcements`;
  const has = (...k: Kinds) => k.some((x) => kinds.includes(x));
  const list: string[] = [];
  if (has('global-open')) list.push(`new ${t.sideQuest.many}`);
  if (has('story-beat')) list.push('story updates');
  if (has('voting-open')) list.push('voting opening');
  if (has('witness')) list.push(`${t.witness.one} requests`);
  if (has('standing-gained')) list.push('a new standing');
  const other = has('checkin-open', 'global-won', 'global-scored', 'police-call', 'police-tip', 'announcement', 'stop-revealed', 'status', 'approved', 'rejected', 'fraud', 'exposed', 'framed', 'adjust');
  if (other) list.push('game updates');
  if (list.length === 0) return 'nothing';
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * Per-device switch for push notifications. The phone must allow it, and iPhones need the app on the Home Screen.
 * `gmOnly`: a ${t.gm.One} who isn't playing hears about the GM things only.
 */
export function NotificationsCard({ gmOnly = false }: { gmOnly?: boolean }) {
  const toast = useToast();
  const [support, setSupport] = useState<PushSupport>(() => currentPushSupport());
  const [on, setOn] = useState(() => isPushOn());
  const [busy, setBusy] = useState(false);

  if (support === 'off') return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        await forgetThisDevice();
        setOn(false);
      } else {
        const granted = await enablePush();
        setOn(granted);
        if (!granted) toast('Notifications stay off. You can allow them in your phone settings.', 'info');
      }
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setSupport(currentPushSupport());
      setBusy(false);
    }
  };

  const status =
    support === 'unsupported'
      ? "This phone or browser can't get notifications."
      : support === 'ios-install'
        ? `On iPhone, first tap Share › Add to Home Screen, open ${pack.name} from there, then come back here.`
        : support === 'blocked'
          ? "Notifications are blocked for this app. Allow them in your phone's settings."
          : on
            ? gmOnly
              ? 'On. We will buzz this phone for join requests, entries to check and switchboard alerts.'
              : `On. We will buzz this phone for ${playerHears(pack.pushKinds)}.`
            : 'Off. Nothing is sent to this phone.';

  return (
    <section className="locate" aria-labelledby="notify-title">
      <div className="locate__row">
        <Icon name="megaphone" size={24} strokeWidth={2.2} />
        <div className="locate__text">
          <h2 id="notify-title" className="locate__title">
            Notifications
          </h2>
          <p id="notify-desc" className="locate__desc">
            {gmOnly ? 'Join requests, entries to check and alerts' : playerHears(pack.pushKinds).replace(/^./, (c) => c.toUpperCase())}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={on}
          aria-labelledby="notify-title"
          aria-describedby="notify-desc"
          disabled={support !== 'available' || busy}
          onClick={() => void toggle()}
        />
      </div>
      <p className="locate__fine" role="status">
        {status}
      </p>
    </section>
  );
}
