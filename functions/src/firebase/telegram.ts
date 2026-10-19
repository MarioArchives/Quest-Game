// The Telegram line's HTTP side (the telegramLine function): every request from the police script is signed with
// the shared secret TELEGRAM_LINE_SECRET, as HMAC-SHA256 over "timestamp.body".
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TelegramLineError } from '../game/telegramLine.js';

/** A request is refused when its timestamp is further than this from now, either way. */
const SKEW_MS = 300_000;

/** The request as Firebase hands it over (Express). */
export interface LineHttpRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
  body?: unknown;
}

/** The response, as much of Express's as the handler uses. */
export interface LineHttpResponse {
  status(code: number): LineHttpResponse;
  set(field: string, value: string): LineHttpResponse;
  send(body: string): void;
}

export interface LineHttpDeps {
  secret(): string;
  handle(op: unknown): Promise<unknown>;
  log(message: string, err?: unknown): void;
  /** Epoch ms (tests pin it). */
  now?: () => number;
}

/** Hex HMAC-SHA256 of `timestamp.body` with the secret (the script signs the same way). */
export function lineSignature(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
}

/** A signature that matches, on a timestamp within five minutes of now either way. */
export function validLineSignature(secret: string, timestamp: string, body: string, signature: string, nowMs: number): boolean {
  if (!secret || !/^\d+$/.test(timestamp) || typeof signature !== 'string' || signature === '') return false;
  if (Math.abs(nowMs - Number(timestamp) * 1000) > SKEW_MS) return false;
  const expected = Buffer.from(lineSignature(secret, timestamp, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const header = (req: LineHttpRequest, name: string): string => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

/** The telegramLine HTTPS function: POST only, signed, JSON in and out. */
export function lineHandler(deps: LineHttpDeps): (req: LineHttpRequest, res: LineHttpResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('POST only');
      return;
    }
    const raw = req.rawBody ? req.rawBody.toString('utf8') : typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const now = (deps.now ?? Date.now)();
    if (!validLineSignature(deps.secret(), header(req, 'x-line-timestamp'), raw, header(req, 'x-line-signature'), now)) {
      deps.log('telegramLine: refused a request with a missing or wrong signature');
      res.status(403).send('Bad signature');
      return;
    }
    let op: unknown;
    try {
      op = JSON.parse(raw);
    } catch {
      res.status(400).send('Not JSON');
      return;
    }
    try {
      const out = await deps.handle(op);
      res.status(200).set('Content-Type', 'application/json').send(JSON.stringify(out));
    } catch (err) {
      if (err instanceof TelegramLineError) {
        res.status(400).send(err.message);
        return;
      }
      deps.log('telegramLine failed', err);
      res.status(500).send('Error');
    }
  };
}
