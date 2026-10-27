// The registry of game packs. A deployment picks one by id (VITE_GAME_PACK for the app, GAME_PACK for the
// functions and scripts); both default to DEFAULT_PACK_ID.
import { periodicProblems } from '../periodics.ts';
import { CHAT_LINES, isVoiceLine, READ_OUT_LINES } from '../phone.ts';
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
    for (const key of Object.keys(voice.chatLines ?? {})) {
      if (!(CHAT_LINES as readonly string[]).includes(key)) problems.push(`The police chat line "${key}" is not one the engine says in the chat (${CHAT_LINES.join(', ')}).`);
    }
    // Every line is one wording or 1 to 10 variants, none blank; the lines that must carry something say so.
    const MUST_HAVE: Record<string, string> = { accused: '{accusation}', ask: '{question}' };
    const lists: Array<[string, string, unknown]> = [
      ...Object.entries(voice.lines ?? {}).map(([k, v]): [string, string, unknown] => ['line', k, v]),
      ...Object.entries(voice.chatLines ?? {}).map(([k, v]): [string, string, unknown] => ['chat line', k, v]),
    ];
    for (const [what, key, text] of lists) {
      const list = typeof text === 'string' ? [text] : Array.isArray(text) ? (text as unknown[]) : null;
      if (!list || list.some((v) => typeof v !== 'string' || !v.trim())) {
        problems.push(`The police voice ${what} "${key}" is blank.`);
        continue;
      }
      if (list.length < 1 || list.length > 10) problems.push(`The police voice ${what} "${key}" has ${list.length} variants; it needs 1 to 10.`);
      const needs = MUST_HAVE[key];
      for (const v of list as string[]) {
        if (needs && !v.includes(needs)) problems.push(`The police voice ${what} "${key}" must have ${needs} in every variant.`);
        if (v.includes('{officer}') && !voice.officers?.length) problems.push(`The police voice ${what} "${key}" names the {officer}, but the pack has no officers.`);
      }
    }
    for (const [i, officer] of (voice.officers ?? []).entries()) {
      const name = typeof officer?.name === 'string' ? officer.name.trim() : '';
      if (name.length < 1 || name.length > 60) problems.push(`Police officer ${i + 1} needs a name of 1 to 60 characters.`);
      if (officer?.telegramVoice !== undefined && !/^[a-z]{2}-[A-Z]{2}-\w+Neural$/.test(officer.telegramVoice)) {
        problems.push(`Police officer ${i + 1} ("${name}") has a voice "${String(officer.telegramVoice)}" that isn't an edge-tts voice name like en-GB-RyanNeural.`);
      }
    }
    for (const key of voice.recordings ?? []) {
      const given = (voice.lines as Record<string, unknown> | undefined)?.[key];
      if (Array.isArray(given) && given.length > 1) problems.push(`The police voice line "${key}" is recorded, so it must be one wording, not variants.`);
      if ((Array.isArray(given) ? given : [given]).some((v) => typeof v === 'string' && v.includes('{officer}'))) {
        problems.push(`The police voice line "${key}" is recorded, so it can't name the {officer}.`);
      }
    }
    for (const key of voice.recordings ?? []) {
      if ((READ_OUT_LINES as readonly string[]).includes(key)) problems.push(`The police voice line "${key}" is always read out (it changes every call), so it can't be recorded.`);
    }
    if (voice.voice && (!voice.voice.voice?.trim() || !voice.voice.language?.trim())) problems.push('The police voice needs a voice and a language.');
  }
  const relations = pack.booking?.relations;
  if (pack.booking && relations !== undefined) {
    if (!Array.isArray(relations) || relations.length < 2 || relations.length > 16) problems.push('The booking desk relation list needs 2 to 16 relations.');
    else {
      const ids = new Set<string>();
      for (const [i, r] of relations.entries()) {
        const label = `Relation ${i + 1} ("${r?.id}")`;
        if (typeof r?.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(r.id)) problems.push(`${label} needs an id of lower case letters, digits and hyphens.`);
        else if (ids.has(r.id)) problems.push(`${label} has a duplicate id.`);
        else ids.add(r.id);
        const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max;
        if (!text(r?.label, 24)) problems.push(`${label} needs a label of 1 to 24 characters.`);
        if (!text(r?.phrase, 40)) problems.push(`${label} needs a phrase of 1 to 40 characters.`);
      }
    }
  }
  if (pack.policeQuiz) problems.push(...quizProblems(pack));
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
        ['question', q.question],
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
    if (q.question !== undefined) {
      if (q.judging !== 'vote') problems.push(`${label} has a question, but only a mission judged by a vote asks one.`);
      else if (typeof q.question !== 'string' || !q.question.trim() || q.question.length > 60) {
        problems.push(`${label} has a question that must be words of at most 60 characters.`);
      }
    }
    if (q.records && (!q.records.key?.trim() || !q.records.label?.trim())) problems.push(`${label} records a fact that needs a non-blank key and label.`);
  }
  for (const id of dupes) problems.push(`The quest id "${id}" is a duplicate.`);
  for (const q of pack.catalogue.personal) {
    if (!/Proof: \S/.test(q.description)) problems.push(`The personal quest "${q.id}" needs a "Proof: ..." line.`);
  }
  return problems;
}

/** Problems with a pack's police question bank. */
function quizProblems(pack: GamePack): string[] {
  const problems: string[] = [];
  const items = pack.policeQuiz ?? [];
  if (!pack.features.police) problems.push('The pack has a police quiz but the police feature is off.');
  const KINDS = ['sum', 'fixed', 'fact', 'standing', 'stop', 'watch-count', 'own', 'whose'];
  const words = (v: unknown, max: number) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max;
  for (const [i, item] of (items as Array<Record<string, unknown>>).entries()) {
    const label = `Police quiz item ${i + 1} (${String(item.kind)})`;
    if (!KINDS.includes(item.kind as string)) {
      problems.push(`${label} has a kind that isn't one of ${KINDS.join(', ')}.`);
      continue;
    }
    if (item.weight !== undefined && !(Number.isInteger(item.weight) && (item.weight as number) >= 1 && (item.weight as number) <= 10)) {
      problems.push(`${label} has a weight of ${String(item.weight)}; it must be a whole number from 1 to 10.`);
    }
    if (item.kind === 'sum') continue;
    if (!words(item.ask, 80)) problems.push(`${label} needs a question (ask) of 1 to 80 characters.`);
    const decoys = (v: unknown): string[] | null => (Array.isArray(v) && v.every((d) => words(d, 60)) ? (v as string[]) : null);
    switch (item.kind) {
      case 'fixed': {
        const list = decoys(item.decoys);
        if (!words(item.answer, 60)) problems.push(`${label} needs an answer.`);
        else if (!list || new Set(list.filter((d) => d !== item.answer)).size < 2 || list.includes(item.answer as string)) {
          problems.push(`${label} needs at least 2 decoys, none of them the answer.`);
        }
        break;
      }
      case 'fact':
        if (!words(item.fact, 60)) problems.push(`${label} needs the key of the fact it asks about.`);
        if (item.decoys !== undefined && item.decoys !== 'times' && !decoys(item.decoys)) problems.push(`${label} has decoys that must be a list of words, or 'times'.`);
        break;
      case 'standing':
        if (item.pick !== 'lowest' && item.pick !== 'highest') problems.push(`${label} must pick 'lowest' or 'highest'.`);
        break;
      case 'stop':
        if (!pack.features.stops) problems.push(`${label} asks about the stop, but the stops feature is off.`);
        if (!decoys(item.decoys) || (item.decoys as string[]).length < 2) problems.push(`${label} needs at least 2 decoy bars.`);
        break;
      case 'own':
      case 'whose':
        if (item.field !== 'relation' && !(item.kind === 'own' && item.field === 'height')) problems.push(`${label} has a field that isn't ${item.kind === 'own' ? 'relation or height' : 'relation'}.`);
        if (item.field === 'relation' && !pack.booking?.relations?.length) problems.push(`${label} asks about the relation, but the pack has no booking relation list.`);
        if (item.kind === 'whose' && !String(item.ask ?? '').includes('{value}')) problems.push(`${label} needs {value} in its question (the relation's phrase).`);
        break;
    }
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
