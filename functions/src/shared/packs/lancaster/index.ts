// The original game: Festival Quest at Lancaster Music Festival, 8-11 October 2026.
import type { GamePack } from '../types.ts';
import quests from './quests.json' with { type: 'json' };
import venues from './venues.json' with { type: 'json' };

export const lancaster: GamePack = {
  id: 'lancaster',
  name: 'Festival Quest',
  description: 'Secret side quests for Lancaster Music Festival 2026.',
  terms: {
    quest: { one: 'quest', many: 'quests' },
    sideQuest: { one: 'side quest', many: 'side quests' },
    witness: { one: 'witness', many: 'witnesses' },
    claim: { one: 'claim', many: 'claims' },
    gm: { one: 'GM', many: 'GMs' },
    wrap: { one: 'Wrap', many: 'Wraps' },
  },
  features: { guesses: true, sideQuests: true, map: true },
  timeZone: 'Europe/London',
  locale: 'en-GB',
  scoring: 'classic',
  settings: {},
  awards: {},
  catalogue: quests,
  map: {
    centre: { lat: 54.0489, lng: -2.8012 },
    zoom: 16,
    placeName: 'the festival',
    nearbyKm: 2,
    credit: { label: 'Lancaster Music Festival', url: 'https://lancastermusicfestival.com/' },
  },
  venues,
};
