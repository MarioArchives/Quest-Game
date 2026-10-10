import { Icon } from '../../components/Icon';
import { useLocationSharing } from '../../data/LocationProvider';
import { useNow } from '../../data/hooks';
import { useGame } from '../../data/GameProvider';
import { formatAgo } from '../../lib/time';
import { useToast } from '../../components/Toast';

export function LocationCard() {
  const { sharing, setSharing, lastSentAt, problem, supported, position } = useLocationSharing();
  const { state } = useGame();
  const toast = useToast();
  const now = useNow(15_000);

  const toggle = async () => {
    try {
      await setSharing(!sharing);
    } catch {
      toast("Couldn't change location sharing. Try again.", 'error');
    }
  };

  return (
    <section className="locate" aria-labelledby="locate-title">
      <div className="locate__row">
        <Icon name="pin" size={24} strokeWidth={2.2} />
        <div className="locate__text">
          <h2 id="locate-title" className="locate__title">
            Share my location
          </h2>
          <p id="locate-desc" className="locate__desc">
            Players see your last spot for 15 min
          </p>
        </div>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={sharing}
          aria-labelledby="locate-title"
          aria-describedby="locate-desc"
          disabled={!supported}
          onClick={() => void toggle()}
        />
      </div>
      <p className="locate__fine" role="status">
        {!supported
          ? "This device can't share its location."
          : sharing
            ? state.status !== 'active'
              ? 'On. Your spot is only shared while the game is running.'
              : lastSentAt
                ? `On. Last shared ${formatAgo(lastSentAt, now)}.`
                : position
                  ? 'On. Sharing your first spot…'
                  : 'On. Looking for a location fix…'
            : 'Off. Nobody sees where you are.'}
        {' '}Only works while this app is open, and your spot disappears from the map after 15 minutes. Switch it off any time and it is deleted.
      </p>
      {problem ? (
        <p className="note note--error" role="alert">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
