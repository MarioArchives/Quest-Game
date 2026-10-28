// A short hash of every file under some paths (tests left out), so a snapshot can say what it was taken from and the
// deploy can tell when those files have changed since (a pack's tour snapshot, scripts/packs/<id>/snapshot-tour.mjs).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} root the repository
 * @param {string[]} paths files or folders, relative to `root`
 * @returns {Record<string, string>} each file's hash, by its path
 */
export function sourceHashes(root, paths) {
  /** @type {string[]} */
  const files = [];
  const walk = (/** @type {string} */ rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) for (const name of readdirSync(abs)) walk(join(rel, name));
    else if (!/\.test\.ts$/.test(rel)) files.push(rel);
  };
  for (const p of paths) walk(p);
  return Object.fromEntries(files.sort().map((f) => [f, createHash('sha1').update(readFileSync(join(root, f))).digest('hex').slice(0, 16)]));
}
