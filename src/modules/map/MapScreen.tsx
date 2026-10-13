import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow, useQuery } from '../../data/hooks';
import { useLocationSharing } from '../../data/LocationProvider';
import { useVenues } from './venues';
import { countWithin, distanceLabel, distanceMeters } from './geo';
import { formatAgo, isStale } from '../../lib/time';
import { backend } from '../../backend';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { friendlyError } from '../../api';
import { features, pack, t } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import type { PlayerLocation, Stop } from '../../shared';
import { useEvents, useVenueSchedules } from './events';
import { MapView, type MapFocus, type MapPlayer } from './MapView';
import { buildRows, NowNext } from './NowNext';
import { PlaceSearchSheet } from './PlacePicker';
import type { StopState } from './markers';
import { RouteFolder } from './RouteFolder';
import { RouteSheet } from './RouteSheet';
import { hideStop, moveStopBy, revealNext, revealStop } from './routeActions';
import { StopFormSheet, StopViewSheet, type StopDraft } from './StopSheet';
import { nextOrder, nowNext, orderStops, stopStates as computeStopStates, type RouteStop } from './stops';
import { VenueSheet } from './VenueSheet';
import './map.css';

/** How close (metres) a player's last spot must be to count as at the current stop. */
const AT_STOP_M = 75;
/** A pin moved by hand further than this (metres) is no longer at the bar it was picked as: its address goes. */
const SAME_PLACE_M = 150;

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
  const { player, user, isAdmin } = useSession();
  const { state, playersById, activePlayers } = useGame();
  const { sharing, position, problem, supported, setSharing, takeFirstFix } = useLocationSharing();
  const toast = useToast();
  const now = useNow(60_000);

  const venues = useVenues();
  const events = useEvents();
  const schedules = useVenueSchedules(venues, events.events, now);
  const locations = useQuery<PlayerLocation>({ path: 'locations' });

  // The route (packs with stops). The GM reads every stop; a player's query asks for revealed ones only, which is
  // all the rules allow, so a hidden stop's place never reaches their phone.
  const stopDocs = useQuery<Stop>(features.stops ? (isAdmin ? { path: 'stops' } : { path: 'stops', where: [['revealed', '==', true]] }) : null);
  const stops = useMemo(() => orderStops(stopDocs.data, isAdmin), [stopDocs.data, isAdmin]);
  const route = useMemo(() => nowNext(stops, now, isAdmin), [stops, now, isAdmin]);
  const stopStates = useMemo(() => computeStopStates(stops, route, now), [stops, route, now]);
  const canEditStops = !!features.stops && isAdmin;
  // What a tap on the empty map does for the GM: drop a new pin, or move an existing one.
  const [pick, setPick] = useState<{ kind: 'new' } | { kind: 'move'; stop: RouteStop } | null>(null);
  const [draftPin, setDraftPin] = useState<{ lat: number; lng: number } | null>(null);
  const [stopSheet, setStopSheet] = useState<
    { kind: 'view'; id: string } | { kind: 'form'; draft: StopDraft } | { kind: 'delete'; stop: RouteStop } | { kind: 'route' } | { kind: 'find'; near: { lat: number; lng: number } } | null
  >(null);
  const [panelOpen, setPanelOpen] = useState(false);

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
      setPanelOpen(false);
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

  const pickOnMap = (lat: number, lng: number) => {
    if (!pick) return;
    if (pick.kind === 'new') {
      setDraftPin({ lat, lng });
      setStopSheet({ kind: 'form', draft: { kind: 'new', lat, lng, order: nextOrder(stops) } });
    } else {
      const { stop } = pick;
      const moved = distanceMeters(stop, { lat, lng }) > SAME_PLACE_M;
      backend()
        .data.update(`stops/${stop.id}`, moved ? { lat, lng, address: null, placeRef: null, placeName: null } : { lat, lng })
        .then(() => toast(`Moved ${stop.name}.`, 'success'))
        .catch((err) => toast(friendlyError(err), 'error'));
    }
    setPick(null);
  };

  const useMyLocation = () => {
    const place = (lat: number, lng: number) => {
      flyTo(lat, lng, 17);
      pickOnMap(lat, lng);
    };
    if (position) return place(position.lat, position.lng);
    if (!('geolocation' in navigator)) return toast("This device can't share its location. Tap the map instead.", 'error');
    navigator.geolocation.getCurrentPosition(
      (p) => place(p.coords.latitude, p.coords.longitude),
      () => toast("Couldn't get your location. Tap the map instead.", 'error'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const closeStopSheet = () => {
    setStopSheet(null);
    setDraftPin(null);
  };

  const onSelectStop = useCallback(
    (id: string) => {
      const stop = stops.find((s) => s.id === id);
      if (!stop) return;
      if (canEditStops) setStopSheet({ kind: 'form', draft: { kind: 'edit', stop } });
      else setStopSheet({ kind: 'view', id });
    },
    [stops, canEditStops],
  );

  const gmUid = user?.uid ?? '';
  const doRevealNext = async () => {
    try {
      const stop = await revealNext(stops, gmUid);
      if (stop) toast(`Revealed ${stop.name}.`, 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  // Bars are looked up around the last stop (the crawl goes on from there), else around you, else the map's centre.
  const startAdding = () => {
    const last = stops[stops.length - 1];
    const near = last ?? position ?? map.centre;
    setPick(null);
    setStopSheet({ kind: 'find', near: { lat: near.lat, lng: near.lng } });
  };

  const viewing = stopSheet?.kind === 'view' ? stops.find((s) => s.id === stopSheet.id) : undefined;
  const liveVenues = venues.length > 0 ? buildRows(schedules, now).rows.filter((r) => r.kind === 'now').length : 0;

  return (
    <div className={`fqmapscreen${venues.length > 0 ? ' has-panel' : ''}`}>
      <MapView
        centre={[map.centre.lat, map.centre.lng]}
        zoom={map.zoom}
        credit={map.credit}
        schedules={schedules}
        players={others}
        you={you}
        focus={focus}
        onSelectVenue={openFromPin}
        stops={stops}
        stopStates={stopStates}
        onSelectStop={onSelectStop}
        routeStyle={map.routeStyle}
        onPick={pick ? pickOnMap : undefined}
        draft={draftPin}
      >
        <div className="fqmap__top">

          {pick ? (
            <div className="fqnote fqnote--pick" role="status">
              <span>{pick.kind === 'new' ? 'Tap the map to drop the new stop.' : `Tap the map to move ${pick.stop.name}.`}</span>
              <span className="fqnote__actions">
                {pick.kind === 'new' ? (
                  <button type="button" className="fqmap__btn" onClick={useMyLocation}>
                    Use my location
                  </button>
                ) : null}
                <button type="button" className="fqmap__btn" onClick={() => setPick(null)}>
                  Cancel
                </button>
              </span>
            </div>
          ) : null}
          {!player ? <p className="fqnote">Players share their spot here. You&apos;re watching as {t.gm.One}.</p> : null}
          {!supported && player ? <p className="fqnote">This device can&apos;t share its location.</p> : null}
          {problem ? (
            <p className="fqnote fqnote--error" role="alert">
              {problem}
            </p>
          ) : null}
          {farAway ? (
            <p className="fqnote" role="status">
              <strong>{farAway}.</strong> Tap Me to see where you are, or Centre to see {venues.length > 0 ? 'the venues' : 'the map'}.
            </p>
          ) : null}
          {sharing && !gameActive ? <p className="fqnote">Your spot is only shared while the game is running.</p> : null}

          <div className="fqmap__row">
            <div className="fqmap__tools">
              {player ? (
                <button
                  type="button"
                  className={`fqmap__btn fqshare${sharing ? ' is-on' : ''}`}
                  aria-pressed={sharing}
                  disabled={!supported}
                  onClick={() => void toggleSharing()}
                >
                  <Icon name="pin" size={16} strokeWidth={2.4} />
                  {sharing ? 'Sharing · on' : 'Share location'}
                </button>
              ) : null}
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
              {canEditStops ? (
                <button type="button" className="fqmap__btn" onClick={() => setStopSheet({ kind: 'route' })}>
                  <Icon name="menu" size={16} strokeWidth={2.4} />
                  Route
                </button>
              ) : null}
              {canEditStops && stops.some((s) => !s.revealed) ? (
                <button type="button" className="fqmap__btn" onClick={() => void doRevealNext()}>
                  <Icon name="megaphone" size={16} strokeWidth={2.4} />
                  Reveal next
                </button>
              ) : null}
              {canEditStops ? (
                <button type="button" className="fqmap__btn fqmap__btn--add" aria-pressed={pick?.kind === 'new'} onClick={() => (pick?.kind === 'new' ? setPick(null) : startAdding())}>
                  <Icon name="plus" size={16} strokeWidth={2.4} />
                  Add stop
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
            <div className="fqmap__side">
              <p className="fqmap__count" role="status">
                {onMap} {onMap === 1 ? 'player' : 'players'} on the map
              </p>
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
            </div>
          </div>
        </div>

        {stops.length > 0 && !pick ? (
          <RouteFolder
            route={route}
            nowMs={now}
            isAdmin={isAdmin}
            here={route.now ? countWithin([...others, ...(you ? [you] : [])], route.now, AT_STOP_M) : 0}
            total={activePlayers.length}
            onOpen={onSelectStop}
            onRoute={canEditStops ? () => setStopSheet({ kind: 'route' }) : undefined}
          />
        ) : null}

        {venues.length > 0 ? (
          <section className={`fqpanel${panelOpen ? ' is-open' : ''}`} aria-label="Line-up">
            <button type="button" className="fqpanel__bar" aria-expanded={panelOpen} aria-controls="fqpanel-body" onClick={() => setPanelOpen((o) => !o)}>
              <span className="fqpanel__title">Now / Next</span>
              <span className="fqpanel__meta">{liveVenues > 0 ? `${liveVenues} playing now` : 'Nothing on now'}</span>
              <Icon name="chevronDown" size={20} />
            </button>
            <div className="fqpanel__body" id="fqpanel-body" hidden={!panelOpen}>
              <NowNext schedules={schedules} events={events} nowMs={now} onSelect={openFromList} />
            </div>
          </section>
        ) : null}
      </MapView>

      {selected ? <VenueSheet schedule={selected} nowMs={now} onClose={() => setSelectedId(null)} /> : null}

      {stopSheet?.kind === 'route' ? (
        <RouteSheet
          stops={stops}
          nowMs={now}
          onClose={closeStopSheet}
          onReveal={async (stop) => {
            await revealStop(stop, gmUid);
            toast(`Revealed ${stop.name}.`, 'success');
          }}
          onHide={async (stop) => {
            await hideStop(stop);
            toast(`Hid ${stop.name}.`, 'success');
          }}
          onRevealNext={doRevealNext}
          onMove={(stop, direction) => moveStopBy(stops, stop.id, direction)}
          onEdit={(stop) => setStopSheet({ kind: 'form', draft: { kind: 'edit', stop } })}
          onAdd={startAdding}
        />
      ) : null}
      {stopSheet?.kind === 'find' ? (
        <PlaceSearchSheet
          near={stopSheet.near}
          onClose={closeStopSheet}
          onPin={() => {
            closeStopSheet();
            setPick({ kind: 'new' });
          }}
          onPick={(place) => {
            flyTo(place.lat, place.lng, 17);
            setDraftPin({ lat: place.lat, lng: place.lng });
            setStopSheet({ kind: 'form', draft: { kind: 'new', lat: place.lat, lng: place.lng, order: nextOrder(stops), place } });
          }}
        />
      ) : null}
      {viewing ? <StopViewSheet stops={stops} stop={viewing} label={stopLabel(stopStates.get(viewing.id))} onClose={closeStopSheet} /> : null}
      {stopSheet?.kind === 'form' ? (
        <StopFormSheet
          draft={stopSheet.draft}
          onClose={closeStopSheet}
          onMove={(stop) => {
            closeStopSheet();
            setPick({ kind: 'move', stop });
          }}
          onDelete={(stop) => setStopSheet({ kind: 'delete', stop })}
        />
      ) : null}
      {stopSheet?.kind === 'delete' ? (
        <ConfirmSheet
          title="Delete this stop?"
          confirmLabel="Delete stop"
          danger
          onClose={closeStopSheet}
          onConfirm={() => backend().data.remove(`stops/${stopSheet.stop.id}`)}
        >
          <p>
            <strong>{stopSheet.stop.name}</strong> comes off the route for everyone.
          </p>
        </ConfirmSheet>
      ) : null}
    </div>
  );
}

function stopLabel(state: StopState | undefined): string | null {
  return state === 'now' ? 'here now' : state === 'next' ? 'next' : state === 'past' ? 'done' : null;
}
