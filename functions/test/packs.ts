// Test packs: the Lancaster pack with its wording or features swapped, so tests can see what follows the pack.
import { getPack } from '../src/shared/packs/index.js';
import type { Features, GamePack, Terms } from '../src/shared/packs/types.js';

/** Every noun different from Lancaster's, so any leftover "quest" or "GM" shows up. */
export const DARE_TERMS: Terms = {
  quest: { one: 'dare', many: 'dares' },
  sideQuest: { one: 'showdown', many: 'showdowns' },
  witness: { one: 'judge', many: 'judges' },
  claim: { one: 'bid', many: 'bids' },
  gm: { one: 'host', many: 'hosts' },
  wrap: { one: 'recap', many: 'recaps' },
};

export const lancaster = (): GamePack => getPack('lancaster');

/** Lancaster with some fields replaced; `features` is merged over Lancaster's. */
export function testPack(overrides: Omit<Partial<GamePack>, 'features'> & { features?: Partial<Features> } = {}): GamePack {
  const base = lancaster();
  const { features, ...rest } = overrides;
  return { ...base, id: 'test', name: 'Dare Night', ...rest, features: { ...base.features, ...features } };
}

export const darePack = (): GamePack => testPack({ terms: DARE_TERMS });
