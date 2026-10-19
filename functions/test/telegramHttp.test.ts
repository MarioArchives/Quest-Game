// The telegramLine function's HTTP side (plan edge case 1): every request from the police script is signed with the
// shared secret as hex HMAC-SHA256 over "timestamp.body"; anything else is refused before the game sees it.
import { describe, expect, it } from 'vitest';
import { lineHandler, lineSignature, validLineSignature, type LineHttpRequest } from '../src/firebase/telegram.js';
import { TelegramLineError } from '../src/game/telegramLine.js';

const SECRET = 'line-secret-for-tests';
/** The same vector is in services/telegram-police/test_police_call.py, so the script and the function agree. */
const VECTOR = { timestamp: '1792400000', body: '{"op":"poll"}', signature: '9ddc8b65b98432e0247193fd2035210b4af65e07f602bb6eebc2a3b5603418b8' };
const AT = Number(VECTOR.timestamp) * 1000;

describe('signing', () => {
  it('signs "timestamp.body" with HMAC-SHA256, in hex, as the script does', () => {
    expect(lineSignature(SECRET, VECTOR.timestamp, VECTOR.body)).toBe(VECTOR.signature);
  });

  it('accepts a matching signature within five minutes either way of now', () => {
    for (const offset of [0, 299_000, -299_000]) {
      expect(validLineSignature(SECRET, VECTOR.timestamp, VECTOR.body, VECTOR.signature, AT + offset), String(offset)).toBe(true);
    }
  });

  it('refuses a stale or future timestamp, a wrong or missing signature, a tampered body, or another secret', () => {
    expect(validLineSignature(SECRET, VECTOR.timestamp, VECTOR.body, VECTOR.signature, AT + 301_000)).toBe(false);
    expect(validLineSignature(SECRET, VECTOR.timestamp, VECTOR.body, VECTOR.signature, AT - 301_000)).toBe(false);
    expect(validLineSignature(SECRET, VECTOR.timestamp, VECTOR.body, '0'.repeat(64), AT)).toBe(false);
    expect(validLineSignature(SECRET, VECTOR.timestamp, VECTOR.body, '', AT)).toBe(false);
    expect(validLineSignature(SECRET, VECTOR.timestamp, '{"op":"poll","max":50}', VECTOR.signature, AT)).toBe(false);
    expect(validLineSignature('another-secret', VECTOR.timestamp, VECTOR.body, VECTOR.signature, AT)).toBe(false);
    expect(validLineSignature(SECRET, 'not-a-time', VECTOR.body, lineSignature(SECRET, 'not-a-time', VECTOR.body), AT)).toBe(false);
  });
});

describe('the telegramLine function', () => {
  function run(req: Partial<LineHttpRequest>, handle: (op: unknown) => Promise<unknown> = async () => ({ ok: true })) {
    const seen: unknown[] = [];
    const out = { code: 0, body: '', type: '' };
    const res = {
      status(code: number) {
        out.code = code;
        return res;
      },
      set(_field: string, value: string) {
        out.type = value;
        return res;
      },
      send(body: string) {
        out.body = body;
      },
    };
    const handler = lineHandler({
      secret: () => SECRET,
      handle: async (op) => {
        seen.push(op);
        return handle(op);
      },
      log: () => {},
      now: () => AT,
    });
    return { done: handler({ method: 'POST', headers: {}, ...req }, res), out, seen };
  }
  const signed = (body: string, timestamp = VECTOR.timestamp): Partial<LineHttpRequest> => ({
    headers: { 'x-line-timestamp': timestamp, 'x-line-signature': lineSignature(SECRET, timestamp, body) },
    rawBody: Buffer.from(body),
  });

  it('hands a signed request to the game and answers with its JSON', async () => {
    const r = run(signed(VECTOR.body), async () => ({ orders: [] }));
    await r.done;
    expect(r.seen).toEqual([{ op: 'poll' }]);
    expect(r.out.code).toBe(200);
    expect(r.out.type).toMatch(/json/);
    expect(JSON.parse(r.out.body)).toEqual({ orders: [] });
  });

  it('refuses an unsigned, badly signed, stale or tampered request with 403, before the game sees it', async () => {
    const cases: Array<Partial<LineHttpRequest>> = [
      { rawBody: Buffer.from(VECTOR.body) },
      { headers: { 'x-line-timestamp': VECTOR.timestamp, 'x-line-signature': '0'.repeat(64) }, rawBody: Buffer.from(VECTOR.body) },
      signed(VECTOR.body, String(Number(VECTOR.timestamp) - 600)),
      { ...signed(VECTOR.body), rawBody: Buffer.from('{"op":"poll","max":50}') },
    ];
    for (const req of cases) {
      const r = run(req);
      await r.done;
      expect(r.out.code).toBe(403);
      expect(r.seen).toEqual([]);
    }
  });

  it('only takes POST', async () => {
    const r = run({ ...signed(VECTOR.body), method: 'GET' });
    await r.done;
    expect(r.out.code).toBe(405);
    expect(r.seen).toEqual([]);
  });

  it('answers 400 for a body that is not JSON, or an op the game refuses', async () => {
    const notJson = run(signed('not json'));
    await notJson.done;
    expect(notJson.out.code).toBe(400);
    expect(notJson.seen).toEqual([]);
    const refused = run(signed('{"op":"dance"}'), async () => {
      throw new TelegramLineError('Unknown op.');
    });
    await refused.done;
    expect(refused.out.code).toBe(400);
  });

  it('answers 500 when the game fails', async () => {
    const r = run(signed(VECTOR.body), async () => {
      throw new Error('boom');
    });
    await r.done;
    expect(r.out.code).toBe(500);
  });
});
