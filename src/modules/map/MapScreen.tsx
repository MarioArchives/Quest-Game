import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../data/hooks';
import { useLocationSharing } from '../../data/LocationProvider';
import { useVenues } from './venues';
import { distanceLabel } from './geo';
import { formatAgo, isStale } from '../../lib/time';
import { pack } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import type { PlayerLocation } from '../../shared';
import { useEvents, useVenueSchedules } from './events';
import { MapView, type MapFocus, type MapPlayer } from './MapView';
import { NowNext } from './NowNext';
import { VenueSheet } from './VenueSheet';
import './map.css';

const LEGEND = [
  { cls: 'now', label: 'Playing now' },
  { cls: 'soon', label: 'Next up' },
  { cls: 'later', label: 'Later' },
] as const;

/** "±35 m", or "±1.4 km" once the fix is that rough (a desktop's network location often is). */
function formatAccuracy(metres: number): string {
  if (metres < 1000) return `±${Math.max(1, Math.round(metres))} m`;
  const km = metres / 1000;
  return `±${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export default function MapScreen() {
  const map = pack.map;
  if (!map) return null; // the route only exists for packs with a map
  return <MapBody map={map} />;
}

function MapBody({ map }: { map: NonNullable<typeof pack.map> }) {
  const { player } = useSession();
  const { state, playersById } = useGame();
  const { sharing, position, problem, supported, setSharing, takeFirstFix } = useLocationSharing();
  const toast = useToast();
  const now = useNow(60_000);

  const venues = useVenues();
  const events = useEvents();
  const schedules = useVenueSchedules(venues, events.events, now);
  const locations = useQuery<PlayerLocation>({ path: 'locations' });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const flyTo = useCallback((lat: number, lng: number, zoom?: number, accuracy?: number | null) => {
    setFocus({ lat, lng, zoom, accuracy, nonce: Date.now() });
  }, []);

  // The first fix after sharing starts: take the player there once, wherever they are (not on every fix).
  useEffect(() => {
    if (sharing && position && takeFirstFix()) flyTo(position.lat, position.lng, 17, position.accuracy);
  }, [sharing, position, takeFirstFix, flyTo]);

  // Everyone else who shared a spot in the last 15 minutes.
  const others = useMemo<MapPlayer[]>(() => {
    const list: MapPlayer[] = [];
    for (const loc of locations.data) {
      if (loc.id === player?.id) continue; // you are drawn from your live position instead
      const who = playersById.get(loc.id);
      const at = tsMs(loc.updatedAt);
      if (!who || who.left || !at || isStale(at, now)) continue;
      if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
      list.push({ uid: loc.id, name: who.displayName, photoURL: who.photoURL, lat: loc.lat, lng: loc.lng, ago: formatAgo(at, now) });
    }
    return list;
  }, [locations.data, playersById, player?.id, now]);

  const you =
    sharing && position
      ? { lat: position.lat, lng: position.lng, name: player?.displayName ?? 'You', accuracy: position.accuracy }
      : null;
  const accuracy = you?.accuracy && you.accuracy > 0 ? you.accuracy : null;
  // "You're 72 km from <place>": the pin is right, you are just somewhere else.
  const farAway = you ? distanceLabel(you, map.centre, map.placeName, map.nearbyKm) : null;
  const findingYou = sharing && !position && !problem;

  const selected = selectedId ? schedules.find((s) => s.venue.id === selectedId) : undefined;

  // A pin tap just opens the sheet; a list tap also brings the pin into view.
  const openFromPin = useCallback((id: string) => setSelectedId(id), []);
  const openFromList = useCallback(
    (id: string) => {
      setSelectedId(id);
      const venue = venues.find((v) => v.id === id);
      if (venue && venue.lat !== null && venue.lng !== null) flyTo(venue.lat, venue.lng);
    },
    [venues, flyTo],
  );

  const toggleSharing = async () => {
    try {
      await setSharing(!sharing);
    } catch {
      toast("Couldn't change location sharing. Try again.", 'error');
    }
  };

  const gameActive = state.status === 'active';
  const onMap = others.length + (you ? 1 : 0);

  return (
    <>
      <div className="fqbar">
        {player ? (
          <button
            type="button"
            className={`fqshare${sharing ? ' is-on' : ''}`}
            aria-pressed={sharing}
            disabled={!supported}
            onClick={() => void toggleSharing()}
          >
            <Icon name="pin" size={18} strokeWidth={2.4} />
            {sharing ? 'Sharing location · on' : 'Share location · off'}
          </button>
        ) : (
          <p className="fqbar__note">Players share their spot here. You&apos;re watching as GM.</p>
        )}
        <p className="fqbar__count" role="status">
          {onMap} {onMap === 1 ? 'player' : 'players'} on the map
        </p>
      </div>
      {!supported && player ? <p className="field__hint">This device can&apos;t share its location.</p> : null}
      {problem ? (
        <p className="note note--error" role="alert">
          {problem}
        </p>
      ) : null}
      {farAway ? (
        <p className="note" role="status">
          <strong>{farAway}.</strong> Tap Me to see where you are, or Centre to see the venues.
        </p>
      ) : null}
      {sharing && !gameActive ? <p className="field__hint">Your spot is only shared while the game is running.</p> : null}

      <MapView
        centre={[map.centre.lat, map.centre.lng]}
        zoom={map.zoom}
        credit={map.credit}
        schedules={schedules}
        players={others}
        you={you}
        focus={focus}
        onSelectVenue={openFromPin}
      >
        <div className="fqmap__tools">
          <button type="button" className="fqmap__btn" onClick={() => flyTo(map.centre.lat, map.centre.lng, map.zoom)}>
            <Icon name="map" size={16} strokeWidth={2.4} />
            Centre
          </button>
          {you ? (
            <button type="button" className="fqmap__btn" onClick={() => flyTo(you.lat, you.lng, 17, you.accuracy)}>
              <Icon name="pin" size={16} strokeWidth={2.4} />
              Me
            </button>
          ) : null}
          {accuracy ? (
            <p className="fqmap__acc" role="status">
              {formatAccuracy(accuracy)}
              <span className="visually-hidden"> accuracy of your location</span>
            </p>
          ) : findingYou ? (
            <p className="fqmap__acc" role="status">
              Finding you…
            </p>
          ) : null}
        </div>
        {venues.length > 0 ? (
          <ul className="fqmap__legend" aria-label="Map key">
            {LEGEND.map((item) => (
              <li key={item.cls}>
                <span className={`fqkey fqkey--${item.cls}`} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        ) : null}
      </MapView>

      {venues.length > 0 ? <NowNext schedules={schedules} events={events} nowMs={now} onSelect={openFromList} /> : null}

      {selected ? (
        <VenueSheet
          schedule={selected}
          nowMs={now}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  );
}
