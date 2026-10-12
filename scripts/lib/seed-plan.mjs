// Pure decisions for scripts/seed.mjs, kept apart so they can be tested without Firestore.
import { DEFAULT_PACK_ID, getPack } from '../../functions/src/shared/packs/index.ts';

/**
 * The pack to seed: `--pack <id>` or `--pack=<id>`, else env.GAME_PACK, else the default pack.
 * Throws (naming the known packs) when the id is unknown.
 * @param {string[]} _argv
 * @param {Record<string, string | undefined>} _env
 * @returns {string}
 */
export function resolvePackId(_argv, _env) {
  let fromFlag;
  for (let i = 0; i < _argv.length; i++) {
    const a = _argv[i];
    if (a === '--pack') {
      fromFlag = _argv[i + 1];
      if (!fromFlag || fromFlag.startsWith('-')) throw new Error('--pack needs a pack id, e.g. --pack starter.');
      i++;
    } else if (a.startsWith('--pack=')) {
      fromFlag = a.slice('--pack='.length);
      if (!fromFlag) throw new Error('--pack needs a pack id, e.g. --pack=starter.');
    }
  }
  // getPack applies the default for an empty id and throws, listing the known packs, for an unknown one.
  const id = fromFlag || _env.GAME_PACK || DEFAULT_PACK_ID;
  getPack(id);
  return id;
}

/**
 * What to do with game/state for this pack.
 *   create   no state yet: `data` is a fresh lobby naming the pack
 *   set-pack state without a pack field (seeded before packs): `data` is { pack }
 *   keep     state already names this pack
 *   switch   state names another pack and switchPack is set: `data` is { pack }
 *   refuse   state names another pack and switchPack is not set; `message` names both packs
 * @param {Record<string, unknown> | undefined} _existing
 * @param {string} _packId
 * @param {{ switchPack: boolean }} _opts
 * @returns {{ action: 'create' | 'set-pack' | 'keep' | 'switch' | 'refuse', data?: Record<string, unknown>, message: string }}
 */
export function planState(_existing, _packId, _opts) {
  if (!_existing) {
    return {
      action: 'create',
      data: { status: 'lobby', startedAt: null, endedAt: null, nextGlobalQuestAt: null, announcement: null, pack: _packId },
      message: `created (lobby, pack ${_packId})`,
    };
  }
  const current = _existing.pack;
  if (!current) return { action: 'set-pack', data: { pack: _packId }, message: `kept existing, pack set to ${_packId}` };
  if (current === _packId) return { action: 'keep', message: `kept existing (pack ${_packId})` };
  if (_opts.switchPack) {
    return { action: 'switch', data: { pack: _packId }, message: `pack switched from ${current} to ${_packId}` };
  }
  return {
    action: 'refuse',
    message:
      `This game is already running the "${current}" pack, but you asked to seed "${_packId}". ` +
      `Seeding another pack over it would mix two games. Pass --switch-pack if you really mean to switch.`,
  };
}

/**
 * What to write to game/settings. With no doc or `reset`: the full defaults (mode 'set'). Otherwise only what is
 * missing, merged (mode 'merge'): top-level keys, and scoringParams keys one by one. Existing values are never
 * replaced. `added` lists what was added ('scoringParams.<key>' for params); mode 'none' when nothing is missing.
 * @param {Record<string, unknown> | undefined} _existing
 * @param {import('../../functions/src/shared/types.ts').Settings} _defaults
 * @param {{ reset: boolean }} _opts
 * @returns {{ mode: 'set' | 'merge' | 'none', data: Record<string, unknown>, added: string[] }}
 */
export function planSettings(_existing, _defaults, _opts) {
  if (!_existing || _opts.reset) return { mode: 'set', data: { ..._defaults }, added: Object.keys(_defaults) };
  const data = {};
  const added = [];
  for (const [key, value] of Object.entries(_defaults)) {
    if (!(key in _existing)) {
      data[key] = value;
      added.push(key);
    } else if (key === 'scoringParams' && _existing[key] && typeof _existing[key] === 'object') {
      const missing = Object.entries(value).filter(([k]) => !(k in _existing[key]));
      if (missing.length > 0) {
        data[key] = Object.fromEntries(missing);
        added.push(...missing.map(([k]) => `scoringParams.${k}`));
      }
    }
  }
  return { mode: added.length > 0 ? 'merge' : 'none', data, added };
}

/**
 * Which optional parts of the demo to seed for the pack's features.
 * @param {import('../../functions/src/shared/packs/types.ts').Features} _features
 * @returns {{ locations: boolean, sideQuest: boolean }}
 */
export function demoParts(_features) {
  return { locations: _features.map, sideQuest: _features.sideQuests };
}
