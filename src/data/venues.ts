import { useEffect, useState } from 'react';
import type { Venue } from '../shared';

let cached: Promise<Venue[]> | null = null;

/** Static festival venues (public/data/venues.json); an empty list if the file is missing. */
export function loadVenues(): Promise<Venue[]> {
  cached ??= fetch(`${import.meta.env.BASE_URL}data/venues.json`)
    .then((res) => (res.ok ? (res.json() as Promise<unknown>) : []))
    .then((json) => (Array.isArray(json) ? (json as Venue[]) : []))
    .catch(() => []);
  return cached;
}

export function useVenues(): Venue[] {
  const [venues, setVenues] = useState<Venue[]>([]);
  useEffect(() => {
    let live = true;
    loadVenues().then((list) => {
      if (live) setVenues(list);
    });
    return () => {
      live = false;
    };
  }, []);
  return venues;
}
