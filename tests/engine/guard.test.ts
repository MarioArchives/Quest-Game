// Engine plan edge case 7: engine code says nothing about any one game. Festival words, the London time zone
// and raw colours belong in a pack (src/packs, functions/src/shared/packs, scripts/packs), never in the engine.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCANNED_DIRS = ['src', 'functions/src', 'scripts', 'public'];
const SCANNED_FILES = ['index.html', 'vite.config.ts'];
const TEXT = /\.(ts|tsx|mjs|js|css|html|json|svg)$/;

/** Pack folders and tests may say anything. */
function isEngine(path: string): boolean {
  return !/(^|\/)packs\//.test(path) && !/\.test\.ts$/.test(path) && !path.startsWith('functions/lib/');
}

function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  return readdirSync(abs).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(ROOT, path)).isDirectory() ? walk(path) : [path];
  });
}

const files = [...SCANNED_DIRS.flatMap(walk), ...SCANNED_FILES]
  .map((p) => relative(ROOT, join(ROOT, p)))
  .filter((p) => TEXT.test(p) && isEngine(p));

function offenders(pattern: RegExp, only: (path: string) => boolean = () => true): string[] {
  const hits: string[] = [];
  for (const path of files.filter(only)) {
    readFileSync(join(ROOT, path), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (pattern.test(line)) hits.push(`${path}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
  }
  return hits;
}

describe('engine code is game-neutral', () => {
  it('scans a sensible set of files', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('src/routes.tsx');
    expect(files).toContain('functions/src/index.ts');
    expect(files.some((f) => f.includes('/packs/'))).toBe(false);
  });

  it('never mentions Lancaster, the festival, gigs, setlists or the Ashton Memorial', () => {
    expect(offenders(/\b(lancaster|festival|festivals|ashton|setlists?|gigs?)\b/i)).toEqual([]);
  });

  it('never hard-codes the London time zone', () => {
    expect(offenders(/Europe\/London/)).toEqual([]);
  });

  it('keeps colours in the tokens: no raw hex colours in engine CSS or index.html', () => {
    const styled = (p: string) => (p.endsWith('.css') && p !== 'src/styles/tokens.css') || p === 'index.html';
    expect(offenders(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/, styled)).toEqual([]);
  });
});

describe('the data layer is swappable (data-layer plan edge case 20)', () => {
  const imports = (path: string) =>
    [...readFileSync(join(ROOT, path), 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
  const source = (dir: string) => walk(dir).filter((p) => /\.(ts|tsx)$/.test(p) && !/\.test\.ts$/.test(p));

  it('only src/backend/firebase/ imports the Firebase web SDK', () => {
    const hits = source('src')
      .filter((p) => !p.startsWith('src/backend/firebase/'))
      .flatMap((p) => imports(p).filter((m) => /^(firebase|@firebase)(\/|$)/.test(m)).map((m) => `${p}: ${m}`));
    expect(hits).toEqual([]);
  });

  it('the game rules and shared code never import Firebase or Node built-ins', () => {
    const hits = [...source('functions/src/game'), ...source('functions/src/shared')].flatMap((p) =>
      imports(p)
        .filter((m) => /^(firebase-admin|firebase-functions|@google-cloud)(\/|$)/.test(m) || m.startsWith('node:'))
        .map((m) => `${p}: ${m}`),
    );
    expect(hits).toEqual([]);
  });

  it('the Firebase server SDKs are only used by the adapters and the entry point', () => {
    const allowed = (p: string) => p.startsWith('functions/src/firebase/') || p === 'functions/src/index.ts';
    const hits = source('functions/src')
      .filter((p) => !allowed(p))
      .flatMap((p) => imports(p).filter((m) => /^firebase-(admin|functions)(\/|$)/.test(m)).map((m) => `${p}: ${m}`));
    expect(hits).toEqual([]);
  });
});
