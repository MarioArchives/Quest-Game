// The GM picks a real bar for a stop: the pubs and bars OpenStreetMap knows near a point and across the pack's search
// area (a whole city), nearest first, filtered as they type. When the full list is busy only the nearby ones load, and
// typing searches the area by name instead. Picking one gives its name, place and address; "drop a pin instead" is
// there for anywhere not listed.
import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Loader } from '../../components/Loader';
import { pack } from '../../pack';
import { distanceMeters, type LatLng } from './geo';
import { barsNear, filterPlaces, searchBars, type Place } from './places';

/** "80 m", "1.2 km". */
const away = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/** Rows shown at once: the nearest, or the nearest matches. */
const SHOWN = 60;
/** Typing pauses this long before a name search (Nominatim asks for one request a second at most). */
const SEARCH_WAIT_MS = 700;

export function PlacePicker({ near, onPick, onPin }: { near: LatLng; onPick(place: Place): void; onPin?(): void }) {
  const area = pack.map?.barSearch;
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; places: Place[]; full: boolean } | { status: 'error' }>({ status: 'loading' });
  const [query, setQuery] = useState('');
  // Name-search finds (backup mode only), kept as the GM keeps typing.
  const [found, setFound] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let live = true;
    barsNear(near, { box: area })
      .then(({ places, source }) => live && setState({ status: 'ready', places, full: source === 'overpass' }))
      .catch(() => live && setState({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [near.lat, near.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Backup mode: the nearby list only, so a name of 3+ letters is looked up across the area.
  const text = query.trim();
  const byName = state.status === 'ready' && !state.full && !!area && text.length >= 3;
  useEffect(() => {
    if (!byName || !area) return;
    let live = true;
    const timer = setTimeout(() => {
      setSearching(true);
      searchBars(text, area)
        .then((places) => {
          if (!live) return;
          setFound((had) => {
            const refs = new Set(had.map((p) => p.ref));
            return [...had, ...places.filter((p) => !refs.has(p.ref))];
          });
        })
        .catch(() => undefined)
        .finally(() => live && setSearching(false));
    }, SEARCH_WAIT_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [byName, text]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    if (state.status !== 'ready') return [];
    const refs = new Set(state.places.map((p) => p.ref));
    return filterPlaces([...state.places, ...found.filter((p) => !refs.has(p.ref))], query, near).slice(0, SHOWN);
  }, [state, found, query, near]);

  return (
    <div className="placesearch">
      <div className="field">
        <label className="field__label" htmlFor="place-q">
          Find the bar
        </label>
        <input
          id="place-q"
          className="input"
          type="search"
          value={query}
          placeholder="Name or street"
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        {state.status === 'ready' && !state.full && area ? (
          <span className="field__hint">The full list is busy, so these are the nearest. Type a name to search all of {area.name}.</span>
        ) : null}
      </div>
      {state.status === 'loading' ? (
        <p className="placesearch__note">
          <Loader inline size={20} label="Looking up the bars" caption="Looking up the bars…" />
        </p>
      ) : null}
      {state.status === 'error' ? <p className="note note--error">Couldn&apos;t reach the bar list. Drop a pin on the map instead.</p> : null}
      {searching ? (
        <p className="placesearch__note">
          <Loader inline size={20} label={`Searching ${area?.name ?? ''}`.trim()} caption={`Searching ${area?.name ?? ''}…`} />
        </p>
      ) : null}
      {state.status === 'ready' && shown.length === 0 && !searching ? (
        <p className="placesearch__note">{query ? `No bar matches “${query}”.` : 'No bars found nearby.'}</p>
      ) : null}
      {shown.length > 0 ? (
        <ul className="placesearch__list" aria-label={area ? `Bars in ${area.name}` : 'Bars nearby'}>
          {shown.map((p) => (
            <li key={p.ref}>
              <button type="button" className="placesearch__row" onClick={() => onPick(p)}>
                <span className="placesearch__name">{p.name}</span>
                <span className="placesearch__meta">
                  {p.address ? `${p.address} · ` : ''}
                  {away(distanceMeters(near, p))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {onPin ? (
        <Button block onClick={onPin} icon={<Icon name="pin" size={18} />}>
          Not listed? Drop a pin instead
        </Button>
      ) : null}
      <p className="placesearch__credit">{area ? `Bars in ${area.name} and nearby, from OpenStreetMap` : 'Bars from OpenStreetMap'}</p>
    </div>
  );
}

/** "Add stop": pick a real bar near the map, or drop a pin. */
export function PlaceSearchSheet({ near, onPick, onPin, onClose }: { near: LatLng; onPick(place: Place): void; onPin(): void; onClose(): void }) {
  return (
    <BottomSheet title="Add a stop" subtitle="Pick the bar. It starts hidden from players." onClose={onClose}>
      <PlacePicker near={near} onPick={onPick} onPin={onPin} />
    </BottomSheet>
  );
}
