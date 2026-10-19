// Twilio for the police phone calls: the real PhoneLine (Twilio's REST API over fetch, Basic auth), the
// X-Twilio-Signature check, and the HTTP side of the voice webhook (policeVoice). Node only: the game rules see a
// PhoneLine and a VoiceReply, never Twilio.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PhoneLineError, type LineHealth, type PhoneLine, type PlaceCall } from '../game/phoneLine.js';
import type { VoiceRequest } from '../game/policePhone.js';
import type { VoiceReply } from '../game/voice.js';

const API = 'https://api.twilio.com/2010-04-01';
/** Ring for 25 s before Twilio calls it no-answer; never bill more than a minute. */
const RING_SECONDS = 25;
const TIME_LIMIT_SECONDS = 60;
const DETECTION_SECONDS = 10;
const REQUEST_TIMEOUT_MS = 10_000;

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** The verified caller ID the police ring from (E.164). */
  callerId: string;
  /** The policeVoice function's public URL, exactly as Twilio will request it. */
  voiceUrl: string;
  /** Injected in tests; the global fetch otherwise. */
  fetch?: typeof fetch;
}

/** The webhook's base URL without any query of its own (ours is added per request). */
const baseOf = (url: string) => url.split('?')[0]!;

/** The webhook URL for one request about a call: the base plus our query, in a fixed order. */
export function voiceUrlFor(base: string, query: Record<string, string>): string {
  const qs = new URLSearchParams(query).toString();
  return qs ? `${baseOf(base)}?${qs}` : baseOf(base);
}

/** A Twilio error reply ({ code, message }) as a PhoneLineError. */
async function refusal(res: Response): Promise<PhoneLineError> {
  let body: { code?: number | string; message?: string } | null = null;
  try {
    body = (await res.json()) as { code?: number | string; message?: string };
  } catch {
    body = null;
  }
  const code = body?.code != null ? String(body.code) : `http-${res.status}`;
  return new PhoneLineError(code, body?.message ?? `Twilio answered ${res.status}`);
}

/** The police's line through Twilio's REST API. */
export function twilioLine(config: TwilioConfig): PhoneLine {
  const http = config.fetch ?? fetch;
  const auth = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`;
  const account = `${API}/Accounts/${encodeURIComponent(config.accountSid)}`;

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await http(url, { ...init, headers: { Authorization: auth, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new PhoneLineError('network', err instanceof Error ? err.message : String(err));
    }
  }

  return {
    callerId: config.callerId,

    async placeCall(call: PlaceCall): Promise<{ sid: string }> {
      const form = new URLSearchParams({
        To: call.to,
        From: config.callerId,
        Url: voiceUrlFor(config.voiceUrl, { ...call.query, step: 'voice' }),
        Method: 'POST',
        StatusCallback: voiceUrlFor(config.voiceUrl, { ...call.query, step: 'status' }),
        StatusCallbackMethod: 'POST',
        Timeout: String(RING_SECONDS),
        TimeLimit: String(TIME_LIMIT_SECONDS),
        // Voicemail is hung up on (and counts as no answer) rather than hearing the question; a silent human is
        // taken as a human after 10 s, so detection never eats the minute.
        MachineDetection: 'Enable',
        MachineDetectionTimeout: String(DETECTION_SECONDS),
      });
      for (const event of ['initiated', 'ringing', 'answered', 'completed']) form.append('StatusCallbackEvent', event);
      const res = await request(`${account}/Calls.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      if (!res.ok) throw await refusal(res);
      const json = (await res.json()) as { sid?: string };
      if (!json.sid) throw new PhoneLineError('http-200', 'Twilio took the call but sent no id');
      return { sid: json.sid };
    },

    async health(): Promise<LineHealth> {
      try {
        const res = await request(`${account}.json`);
        if (!res.ok) {
          const err = await refusal(res);
          return { ok: false, message: `Twilio error ${err.code}: ${err.message}`, balance: null, code: err.code };
        }
        const status = String(((await res.json()) as { status?: string }).status ?? 'unknown');
        let balance: string | null = null;
        const bal = await request(`${account}/Balance.json`);
        if (bal.ok) {
          const b = (await bal.json()) as { balance?: string; currency?: string };
          balance = b.balance != null ? `${b.balance} ${b.currency ?? ''}`.trim() : null;
        }
        if (status !== 'active') return { ok: false, message: `The Twilio account is ${status}`, balance, code: null };
        return { ok: true, message: 'Active', balance, code: null };
      } catch (err) {
        const code = err instanceof PhoneLineError ? err.code : 'network';
        return { ok: false, message: err instanceof Error ? err.message : String(err), balance: null, code };
      }
    },
  };
}

/**
 * X-Twilio-Signature: base64 HMAC-SHA1, keyed with the auth token, over the full URL Twilio requested followed by
 * every POST param's name and value, sorted by name.
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

/** True when the header is Twilio's signature for this URL and these params (compared in constant time). */
export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, header: unknown): boolean {
  if (typeof header !== 'string' || header.length === 0 || !authToken) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The slice of an Express request the webhook reads. */
export interface VoiceHttpRequest {
  method: string;
  originalUrl?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  rawBody?: Buffer;
}

/** The slice of an Express response it writes. */
export interface VoiceHttpResponse {
  status(code: number): VoiceHttpResponse;
  set(field: string, value: string): VoiceHttpResponse;
  send(body: string): unknown;
}

export interface VoiceHttpDeps {
  authToken(): string;
  /** The webhook's public URL, as it was given to Twilio (the query is added from the request). */
  voiceUrl(): string;
  handle(req: VoiceRequest): Promise<VoiceReply>;
  render(reply: VoiceReply): string;
  log(message: string, err?: unknown): void;
}

/** Twilio posts form fields: read them from the raw body when there is one, else from the parsed body. */
function formParams(req: VoiceHttpRequest): Record<string, string> {
  if (req.rawBody && req.rawBody.length > 0) return Object.fromEntries(new URLSearchParams(req.rawBody.toString('utf8')));
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]));
}

const SORRY = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, something went wrong. Check the app.</Say><Hangup/></Response>';

/** The policeVoice HTTPS function: checks Twilio's signature, then answers with TwiML (empty for status callbacks). */
export function voiceHandler(deps: VoiceHttpDeps) {
  return async (req: VoiceHttpRequest, res: VoiceHttpResponse): Promise<void> => {
    if (req.method !== 'POST') {
      res.status(405).send('POST only');
      return;
    }
    const path = req.originalUrl ?? req.url ?? '';
    const queryString = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
    const url = queryString ? `${baseOf(deps.voiceUrl())}?${queryString}` : baseOf(deps.voiceUrl());
    const params = formParams(req);
    if (!validTwilioSignature(deps.authToken(), url, params, req.headers['x-twilio-signature'])) {
      deps.log(`policeVoice: refused a request with a missing or wrong signature (${url})`);
      res.status(403).send('Bad signature');
      return;
    }
    const query = Object.fromEntries(new URLSearchParams(queryString));
    try {
      const reply = await deps.handle({ query, params });
      res.status(200).set('Content-Type', 'text/xml').send(deps.render(reply));
    } catch (err) {
      deps.log('policeVoice failed', err);
      // A status callback can fail loudly; a caller on the line hears an apology instead of Twilio's error.
      if (query.step === 'status') res.status(500).send('Error');
      else res.status(200).set('Content-Type', 'text/xml').send(SORRY);
    }
  };
}
