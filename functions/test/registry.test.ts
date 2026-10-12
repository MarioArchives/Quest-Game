// Data-layer plan edge case 18: the callable and trigger registries that both functions/src/index.ts and the
// mock backend run from.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CALLABLES } from '../src/game/callables.js';
import { matchPattern, TRIGGERS } from '../src/game/triggers.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** Callable names the app calls: call<…>('name', …) in src/api.ts. */
function appCallables(): string[] {
  const names = read('../../src/api.ts')
    .split('\n')
    .map((line) => /\bcall(?:<.*>)?\(\s*'([A-Za-z]+)'/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name));
  return [...new Set(names)].sort();
}

describe('CALLABLES', () => {
  it('has exactly the actions the app calls', () => {
    expect(appCallables().length).toBeGreaterThanOrEqual(19);
    expect(Object.keys(CALLABLES).sort()).toEqual(appCallables());
  });

  it('every entry has a handler', () => {
    for (const [name, def] of Object.entries(CALLABLES)) expect(typeof def.run, name).toBe('function');
  });

  it('the heavy actions keep their longer timeouts', () => {
    expect(CALLABLES.endGame?.timeoutSeconds).toBe(120);
    expect(CALLABLES.resetGame?.timeoutSeconds).toBe(300);
  });

  it('functions/src/index.ts exports one function per callable and per trigger', () => {
    const index = read('../src/index.ts');
    for (const name of [...Object.keys(CALLABLES), ...TRIGGERS.map((t) => t.name), 'globalQuestTick']) {
      expect(index, name).toMatch(new RegExp(`export const ${name}\\b`));
    }
  });
});

describe('TRIGGERS', () => {
  it('are the five document triggers, on the same paths as before', () => {
    expect(TRIGGERS.map((t) => [t.name, t.pattern, t.on]).sort()).toEqual([
      ['onAdminCreated', 'admins/{uid}', 'create'],
      ['onFeedCreated', 'feed/{feedId}', 'create'],
      ['onFeedReactionWritten', 'feed/{feedId}/reactions/{uid}', 'write'],
      ['onJoinRequestCreated', 'joinRequests/{uid}', 'create'],
      ['onSubmissionCreated', 'submissions/{submissionId}', 'create'],
    ]);
  });

  it('every pattern alternates collection names and unique {params}', () => {
    for (const { name, pattern } of TRIGGERS) {
      const parts = pattern.split('/');
      expect(parts.length % 2, name).toBe(0);
      const params = parts.filter((_, i) => i % 2 === 1);
      for (const p of params) expect(p, name).toMatch(/^\{[A-Za-z]+\}$/);
      for (const c of parts.filter((_, i) => i % 2 === 0)) expect(c, name).toMatch(/^[A-Za-z]+$/);
      expect(new Set(params).size, name).toBe(params.length);
      expect(typeof TRIGGERS.find((t) => t.name === name)?.run).toBe('function');
    }
  });
});

describe('matchPattern', () => {
  it('extracts the params of a matching path', () => {
    expect(matchPattern('submissions/{id}', 'submissions/abc')).toEqual({ id: 'abc' });
    expect(matchPattern('feed/{feedId}/reactions/{uid}', 'feed/f1/reactions/u1')).toEqual({ feedId: 'f1', uid: 'u1' });
  });

  it('refuses another depth or another collection', () => {
    expect(matchPattern('submissions/{id}', 'submissions/abc/x/y')).toBeNull();
    expect(matchPattern('submissions/{id}', 'submissions')).toBeNull();
    expect(matchPattern('submissions/{id}', 'players/abc')).toBeNull();
    expect(matchPattern('feed/{feedId}/reactions/{uid}', 'feed/f1/likes/u1')).toBeNull();
  });
});
