#!/usr/bin/env node
// Imports the Lancaster Music Festival schedule from LMF's public Knack database and writes the
// static data the app ships with:
//   public/data/events.json, public/data/venues.json, functions/src/data/venues.json
// Usage: node scripts/import-schedule.mjs
//
// Be polite: requests are sequential, ~1 s apart, with a descriptive User-Agent. The app schema /
// loader endpoints are deliberately not used (they contain personal data) and raw responses are
// never written to disk.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformKnack } from './lib/knack.mjs';

const APP_ID = '60a243fc1d20a3001b343aaa';
const API_KEY = 'knack';
const BASE_URL = 'https://eu-api.knack.com/v1';
const USER_AGENT = 'FestivalQuest-schedule-import/1.0 (private friends game for Lancaster Music Festival 2026)';
const REQUEST_GAP_MS = 1000;
const ROWS_PER_PAGE = 1000;
const MAX_ATTEMPTS = 3;

/** @type {{ key: 'byDay' | 'byVenue' | 'byAct' | 'venues' | 'gps', scene: string, view: string }[]} */
const VIEWS = [
  { key: 'byDay', scene: 'scene_98', view: 'view_102' },
  { key: 'byVenue', scene: 'scene_90', view: 'view_93' },
  { key: 'byAct', scene: 'scene_118', view: 'view_125' },
  { key: 'venues', scene: 'scene_168', view: 'view_194' },
  { key: 'gps', scene: 'scene_224', view: 'view_265' },
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = {
  events: path.join(root, 'public/data/events.json'),
  venues: path.join(root, 'public/data/venues.json'),
  functionsVenues: path.join(root, 'functions/src/data/venues.json'),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequestAt = 0;

/**
 * GET one page of a view's records, spacing requests REQUEST_GAP_MS apart and retrying transient errors.
 * @param {string} scene
 * @param {string} view
 * @param {number} page
 * @returns {Promise<{ total_pages: number, current_page: number, total_records: number, records: object[] }>}
 */
async function fetchPage(scene, view, page) {
  const url = `${BASE_URL}/pages/${scene}/views/${view}/records?page=${page}&rows_per_page=${ROWS_PER_PAGE}`;
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequestAt + REQUEST_GAP_MS * attempt - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      const res = await fetch(url, {
        headers: {
          'X-Knack-Application-Id': APP_ID,
          'X-Knack-REST-API-Key': API_KEY,
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`${view} page ${page} failed: ${err.message}`);
      console.warn(`${view} page ${page} attempt ${attempt} failed (${err.message}); retrying`);
    }
  }
}

/** All records of a view, following pagination. */
async function fetchAll(scene, view) {
  const records = [];
  let page = 1;
  for (;;) {
    const body = await fetchPage(scene, view, page);
    records.push(...(body.records ?? []));
    if (!body.total_pages || page >= body.total_pages) break;
    page++;
  }
  return records;
}

/** Pretty JSON with a trailing newline. */
const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function main() {
  const raw = {};
  for (const { key, scene, view } of VIEWS) {
    raw[key] = await fetchAll(scene, view);
    console.log(`fetched ${view} (${key}): ${raw[key].length} records`);
  }

  const coordOverrides = JSON.parse(await readFile(path.join(root, 'scripts/venue-coords.json'), 'utf8'));
  const { events, venues } = transformKnack({ ...raw, coordOverrides });

  await Promise.all(
    [OUT.events, OUT.venues, OUT.functionsVenues].map((file) => mkdir(path.dirname(file), { recursive: true })),
  );
  await Promise.all([
    writeFile(OUT.events, toJson(events)),
    writeFile(OUT.venues, toJson(venues)),
    writeFile(OUT.functionsVenues, toJson(venues)),
  ]);

  const noCoords = venues.filter((v) => v.lat === null || v.lng === null);
  console.log(`events: ${events.length} (of ${raw.byDay.length} gigs; ${raw.byDay.length - events.length} skipped)`);
  console.log(`venues: ${venues.length}`);
  console.log(`venues without coordinates: ${noCoords.length}${noCoords.length ? ` (${noCoords.map((v) => v.name).join(', ')})` : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
