// The GM picks a real bar for a stop: the pubs and bars OpenStreetMap knows near a point, nearest first, filtered as
// they type. Picking one gives its name, place and address; "drop a pin instead" is there for anywhere not listed.
import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { distanceMeters, type LatLng } from './geo';
import { barsNear, filterPlaces, type Place } from './places';

/** "80 m", "1.2 km". */
const away = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

export function PlacePicker({ near, onPick, onPin }: { near: LatLng; onPick(place: Place): void; onPin?(): void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; places: Place[] } | { status: 'error' }>({ status: 'loading' });
  const [query, setQuery] = useState('');

  useEffect(() => {
    let live = true;
    barsNear(near)
      .then((places) => live && setState({ status: 'ready', places }))
      .catch(() => live && setState({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [near.lat, near.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (state.status === 'ready' ? filterPlaces(state.places, query, near).slice(0, 40) : []), [state, query, near]);

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
      </div>
      {state.status === 'loading' ? <p className="placesearch__note">Looking up the bars nearby…</p> : null}
      {state.status === 'error' ? <p className="note note--error">Couldn&apos;t reach the bar list. Drop a pin on the map instead.</p> : null}
      {state.status === 'ready' && shown.length === 0 ? (
        <p className="placesearch__note">{query ? `No bar nearby matches “${query}”.` : 'No bars found nearby.'}</p>
      ) : null}
      {shown.length > 0 ? (
        <ul className="placesearch__list" aria-label="Bars nearby">
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
      <p className="placesearch__credit">Bars from OpenStreetMap</p>
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
