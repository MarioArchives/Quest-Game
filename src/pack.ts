// The game pack this build is for (VITE_GAME_PACK, default DEFAULT_PACK_ID): its words, features, time zone and map.
// Look and art come from the pack's look half through the `@pack` alias (see vite.config.ts).
import { getPack } from '../functions/src/shared/packs/index.ts';
import { termForms } from '../functions/src/shared/packs/terms.ts';
import type { Zone } from './lib/time';

export const pack = getPack(import.meta.env.VITE_GAME_PACK);
/** The pack's nouns in every form: t.quest.One, t.sideQuest.many, … */
export const t = termForms(pack.terms);
export const features = pack.features;
export const zone: Zone = { timeZone: pack.timeZone, locale: pack.locale };
