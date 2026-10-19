// The registry of game packs. A deployment picks one by id (VITE_GAME_PACK for the app, GAME_PACK for the
// functions and scripts); both default to DEFAULT_PACK_ID.
import { periodicProblems } from '../periodics.ts';
import { isVoiceLine } from '../phone.ts';
import type { Settings } from '../types.ts';
import { DEFAULT_SETTINGS } from '../settings.ts';
import { RULESETS } from '../scoring/index.ts';
import { paramDefaults } from '../scoring/engine.ts';
import { TERM_KEYS, type CatalogueQuest, type GamePack } from './types.ts';
import { lancaster } from './lancaster/index.ts';
import { mystery } from './mystery/index.ts';
import { starter } from './starter/index.ts';

export const DEFAULT_PACK_ID = 'lancaster';

/** Every pack, by id. */
export const PACKS: Readonly<Record<string, GamePack>> = { lancaster, mystery, starter };

/** The ids of every registered pack, sorted. */
export function packIds(): string[] {
  return Object.keys(PACKS).sort();
}

/** The pack with this id; a missing or empty id gives the default. Throws on an unknown id, listing the known ones. */
export function getPack(id?: string | null): GamePack {
  const key = id || DEFAULT_PACK_ID;
  const pack = Object.hasOwn(PACKS, key) ? PACKS[key] : undefined;
  if (!pack) throw new Error(`Unknown game pack "${key}". Known packs: ${packIds().join(', ')}.`);
  return pack;
}

function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Problems with a pack, as readable sentences; empty when it is fine. */
export function validatePack(pack: GamePack): string[] {
  const problems: string[] = [];
  if (!/^[a-z][a-z0-9-]*$/.test(pack.id)) {
    problems.push(`The pack id "${pack.id}" must be lower case letters, digits and hyphens, starting with a letter.`);
  }
  for (const key of TERM_KEYS) {
    const noun = pack.terms[key];
    if (!noun?.one?.trim() || !noun?.many?.trim()) {
      problems.push(`The term "${key}" needs a non-blank singular and plural.`);
    }
  }
  if (!Object.hasOwn(RULESETS, pack.scoring)) {
    problems.push(`The default scoring rule set "${pack.scoring}" does not exist (known: ${Object.keys(RULESETS).join(', ')}).`);
  }
  if (!validTimeZone(pack.timeZone)) problems.push(`The time zone "${pack.timeZone}" is not a valid IANA zone.`);
  if (pack.features.map) {
    // Venues are optional: without them the map shows the players who share their location.
    if (!pack.map) problems.push('The map feature is on but the pack has no map setup.');
    const area = pack.map?.barSearch;
    if (area) {
      const { name, south, west, north, east } = area;
      const lat = (n: number) => Number.isFinite(n) && Math.abs(n) <= 90;
      const lng = (n: number) => Number.isFinite(n) && Math.abs(n) <= 180;
      if (!name?.trim()) problems.push('The bar search area needs a name.');
      if (!lat(south) || !lat(north) || !lng(west) || !lng(east) || south >= north || west >= east) {
        problems.push('The bar search area needs south < north (latitudes) and west < east (longitudes).');
      }
    }
  }
  if (pack.features.stops && !pack.features.map) problems.push('The stops feature draws on the map, so the map feature must be on too.');
  for (const [i, stop] of (pack.route ?? []).entries()) {
    const name = stop.name?.trim() ?? '';
    if (name.length < 1 || name.length > 60) problems.push(`Route stop ${i + 1} needs a name of 1 to 60 characters.`);
    const placed = Number.isFinite(stop.lat) && Math.abs(stop.lat) <= 90 && Number.isFinite(stop.lng) && Math.abs(stop.lng) <= 180;
    if (!placed) problems.push(`Route stop ${i + 1} ("${name}") needs a latitude between -90 and 90 and a longitude between -180 and 180.`);
    if (stop.address !== undefined && (typeof stop.address !== 'string' || !stop.address.trim() || stop.address.length > 200)) {
      problems.push(`Route stop ${i + 1} ("${name}") has an address that is blank or over 200 characters.`);
    }
    if (stop.placeRef !== undefined && (typeof stop.placeRef !== 'string' || !stop.placeRef.trim() || stop.placeRef.length > 80)) {
      problems.push(`Route stop ${i + 1} ("${name}") has a place reference that is blank or over 80 characters.`);
    }
  }
  if (pack.route && pack.route.length > 999) problems.push('The route has more than 999 stops.');
  if (pack.route?.length && !pack.features.stops) problems.push('The pack has a route but the stops feature is off.');
  for (const key of ['checkin', 'confidant', 'poi', 'policeCall'] as const) {
    const noun = pack.terms[key];
    if (noun && (!noun.one?.trim() || !noun.many?.trim())) problems.push(`The term "${key}" needs a non-blank singular and plural.`);
  }
  const seenPeriodics = new Set<string>();
  for (const [i, p] of (pack.periodics ?? []).entries()) {
    const label = `Periodic mission ${i + 1} ("${p.id}")`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.id)) problems.push(`${label} needs an id of lower case letters, digits and hyphens.`);
    if (seenPeriodics.has(p.id)) problems.push(`${label} has a duplicate id.`);
    seenPeriodics.add(p.id);
    for (const problem of periodicProblems(p)) problems.push(`${label}: ${problem}`);
  }
  if (pack.periodics?.length && !pack.features.checkins) problems.push('The pack has periodic missions but the checkins feature is off.');
  const voice = pack.policeVoice;
  if (voice) {
    if (!pack.features.police) problems.push('The pack has a police voice but the police feature is off.');
    for (const key of [...Object.keys(voice.lines ?? {}), ...(voice.recordings ?? [])]) {
      if (!isVoiceLine(key)) problems.push(`The police voice line "${key}" is not one the engine says.`);
    }
    for (const [key, text] of Object.entries(voice.lines ?? {})) {
      if (typeof text !== 'string' || !text.trim()) problems.push(`The police voice line "${key}" is blank.`);
    }
    if (voice.voice && (!voice.voice.voice?.trim() || !voice.voice.language?.trim())) problems.push('The police voice needs a voice and a language.');
  }
  if (pack.reactions !== undefined && pack.reactions !== 'emoji' && pack.reactions !== 'votes') {
    problems.push(`reactions is "${String(pack.reactions)}"; it must be "emoji" or "votes".`);
  }
  if (pack.gmQuickPoints !== undefined && !(Number.isInteger(pack.gmQuickPoints) && pack.gmQuickPoints > 0)) {
    problems.push(`gmQuickPoints is ${pack.gmQuickPoints}; it must be a positive whole number.`);
  }
  if (pack.features.sideQuests && pack.catalogue.global.length === 0) {
    problems.push('Side quests are on but the catalogue has no side quests (global list is empty).');
  }
  const seen = new Set<string>();
  const dupes = new Set<string>();
  const all: Array<[CatalogueQuest, 'p-' | 'g-']> = [
    ...pack.catalogue.personal.map((q): [CatalogueQuest, 'p-'] => [q, 'p-']),
    ...pack.catalogue.global.map((q): [CatalogueQuest, 'g-'] => [q, 'g-']),
  ];
  for (const [q, prefix] of all) {
    if (seen.has(q.id)) dupes.add(q.id);
    seen.add(q.id);
    if (!q.id.startsWith(prefix)) {
      problems.push(`The ${prefix === 'p-' ? 'personal' : 'side'} quest "${q.id}" must have the prefix ${prefix}.`);
    }
    if (q.points != null && !(Number.isInteger(q.points) && q.points > 0)) {
      problems.push(`The quest "${q.id}" has points ${q.points}; points must be a positive whole number.`);
    }
  }
  const story = pack.catalogue.story ?? [];
  if (story.length > 0 && !pack.features.sideQuests) problems.push('The pack has story missions but side quests are off.');
  for (const [i, q] of story.entries()) {
    const label = `Story mission ${i + 1} ("${q.id}")`;
    if (seen.has(q.id)) dupes.add(q.id);
    seen.add(q.id);
    if (!q.id.startsWith('s-')) problems.push(`${label} must have the prefix s-.`);
    if (!q.title?.trim()) problems.push(`${label} needs a title.`);
    const announce = q.kind === 'announce';
    if (q.kind !== undefined && q.kind !== 'mission' && q.kind !== 'announce') problems.push(`${label} has kind "${String(q.kind)}"; the kind must be 'mission' or 'announce'.`);
    const whole = (n: number | null | undefined) => n == null || (Number.isInteger(n) && n >= 0);
    if (announce) {
      // An announcement is a note: it takes no entries, so none of a mission's settings make sense on it.
      const extras: [string, unknown][] = [
        ['judging', q.judging],
        ['points', q.points],
        ['window', q.windowMin],
        ['entry', q.entry],
        ['vote points', q.votePoints],
        ['tie bonus', q.tieBonus],
        ['fastest bonus', q.fastestBonus],
        ['fine', q.penalty],
        ['long-running setting', q.longRun],
        ['record', q.records],
      ];
      for (const [what, value] of extras) if (value != null) problems.push(`${label} is an announcement, so it cannot have ${what}.`);
      if (q.fact && (!q.fact.key?.trim() || !q.fact.label?.trim() || !q.fact.value?.trim())) {
        problems.push(`${label} has a fact that needs a non-blank key, label and value.`);
      }
      if (q.opensVoteOn != null) {
        const target = story.find((s) => s.id === q.opensVoteOn);
        if (!target || target.kind === 'announce') problems.push(`${label} opens the vote on "${q.opensVoteOn}", which is not a story mission in this story.`);
      }
      continue;
    }
    if (q.judging !== 'vote' && q.judging !== 'submit') problems.push(`${label} must be judged by 'vote' or 'submit' (judging).`);
    if (q.fact) problems.push(`${label} is a mission, so it cannot have a fact (only an announcement records one).`);
    if (q.opensVoteOn != null) problems.push(`${label} is a mission, so it cannot open the vote on another (opensVoteOn is for announcements).`);
    const maxWindow = q.longRun ? 720 : 180;
    if (q.windowMin != null && !(Number.isInteger(q.windowMin) && q.windowMin >= 5 && q.windowMin <= maxWindow)) {
      problems.push(`${label} has a window of ${q.windowMin}; it must be a whole number of minutes from 5 to ${maxWindow}.`);
    }
    if (!whole(q.points)) problems.push(`${label} has points ${q.points}; points must be a whole number, 0 or more.`);
    if (!whole(q.fastestBonus)) problems.push(`${label} has a fastest bonus of ${q.fastestBonus}; it must be a whole number, 0 or more.`);
    if (!whole(q.penalty)) problems.push(`${label} has a fine of ${q.penalty}; the fine must be a whole number, 0 or more.`);
    if (!whole(q.votePoints)) problems.push(`${label} has vote points of ${q.votePoints}; points per vote must be a whole number, 0 or more.`);
    if (!whole(q.tieBonus)) problems.push(`${label} has a tie bonus of ${q.tieBonus}; it must be a whole number, 0 or more.`);
    if (q.entry) {
      const { media, tag } = q.entry;
      if (media !== undefined && media !== 'photo' && media !== 'video' && media !== 'text') problems.push(`${label} has entry media "${String(media)}"; media must be photo, video or text.`);
      if (tag !== undefined && tag !== 'player' && tag !== 'assigned') problems.push(`${label} has entry tag "${String(tag)}"; the tag must be player or assigned.`);
      if (q.entry.caption !== undefined && q.entry.caption !== 'required') problems.push(`${label} has an entry caption setting that must be 'required'.`);
      const writes = q.entry.writesMotive;
      if (writes !== undefined && typeof writes !== 'boolean') problems.push(`${label} has an entry writesMotive setting that must be true or false.`);
      if (writes === true && tag !== 'assigned') problems.push(`${label} writes motives, so its entry tag must be 'assigned' (each motive is about the player dealt).`);
    }
    if (q.records && (!q.records.key?.trim() || !q.records.label?.trim())) problems.push(`${label} records a fact that needs a non-blank key and label.`);
  }
  for (const id of dupes) problems.push(`The quest id "${id}" is a duplicate.`);
  for (const q of pack.catalogue.personal) {
    if (!/Proof: \S/.test(q.description)) problems.push(`The personal quest "${q.id}" needs a "Proof: ..." line.`);
  }
  return problems;
}

/** The engine defaults, then the pack's overrides, its default rule set and every rule set's param defaults. */
export function defaultSettingsFor(pack: GamePack): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...pack.settings,
    scoring: pack.scoring,
    scoringParams: paramDefaults(Object.values(RULESETS)),
  };
}

/** True when game/state names a different pack from the one this app was built for (a missing name is fine). */
export function packMismatch(statePack: string | null | undefined, buildPack: string): boolean {
  return !!statePack && statePack !== buildPack;
}
