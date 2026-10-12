// A plain template for a new game: no map, no venues, a small catalogue of party-friendly challenges.
import type { GamePack } from '../types.ts';
import quests from './quests.json' with { type: 'json' };

export const starter: GamePack = {
  id: 'starter',
  name: 'Quest Game',
  description: 'Secret challenges for a group of friends.',
  terms: {
    quest: { one: 'challenge', many: 'challenges' },
    sideQuest: { one: 'bonus round', many: 'bonus rounds' },
    witness: { one: 'witness', many: 'witnesses' },
    claim: { one: 'claim', many: 'claims' },
    gm: { one: 'GM', many: 'GMs' },
    wrap: { one: 'recap', many: 'recaps' },
  },
  features: { guesses: true, sideQuests: true, map: true },
  timeZone: 'Europe/London',
  locale: 'en-GB',
  scoring: 'classic',
  settings: {},
  awards: {},
  catalogue: quests,
  // No venues: the map shows who is where. Set the centre to wherever the game happens.
  map: { centre: { lat: 51.5074, lng: -0.1278 }, zoom: 14, placeName: 'the party', nearbyKm: 2, credit: null },
  venues: [],
};
