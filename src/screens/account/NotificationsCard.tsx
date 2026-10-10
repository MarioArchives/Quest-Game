import { useState } from 'react';
import { friendlyError } from '../../api';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { currentPushSupport, enablePush, forgetThisDevice, isPushOn } from '../../data/usePush';
import type { PushSupport } from '../../lib/push';

/**
 * Per-device switch for push notifications. The phone must allow it, and iPhones need the app on the Home Screen.
 * `gmOnly`: a GM who isn't playing only hears about join requests.
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
        ? 'On iPhone, first tap Share › Add to Home Screen, open Festival Quest from there, then come back here.'
        : support === 'blocked'
          ? "Notifications are blocked for this app. Allow them in your phone's settings."
          : on
            ? gmOnly
              ? 'On. We will buzz this phone when someone asks to join.'
              : 'On. We will buzz this phone for side quests, votes, witness requests and announcements.'
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
            {gmOnly ? 'Join requests' : 'Side quests, votes and requests'}
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
