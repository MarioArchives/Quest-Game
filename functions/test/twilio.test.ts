// The Twilio adapter (functions/src/firebase/twilio.ts): the X-Twilio-Signature check against Twilio's own published
// vectors, the webhook refusing unsigned requests, and the REST calls it makes (with a fake fetch: nothing here
// reaches Twilio).
import { describe, expect, it } from 'vitest';
import { twilioLine, twilioSignature, validTwilioSignature, voiceHandler, voiceUrlFor, type VoiceHttpRequest } from '../src/firebase/twilio.js';
import { PhoneLineError } from '../src/game/phoneLine.js';
import type { VoiceRequest } from '../src/game/policePhone.js';
import type { VoiceReply } from '../src/game/voice.js';

describe('twilioSignature', () => {
  // Twilio's own examples (the security docs and twilio-node's tests): auth token 12345, this URL and these params.
  const URL = 'https://mycompany.com/myapp.php?foo=1&bar=2';
  const params = (caller: string) => ({ CallSid: 'CA1234567890ABCDE', Caller: caller, Digits: '1234', From: caller, To: '+18005551212' });

  it('matches the known vectors', () => {
    expect(twilioSignature('12345', URL, params('+14158675309'))).toBe('RSOYDt4T1cUTdK1PDd93/VVr8B8=');
    expect(twilioSignature('12345', URL, params('+12349013030'))).toBe('0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
  });

  it('sorts the params by name, whatever order they came in', () => {
    const p = params('+14158675309');
    const shuffled = Object.fromEntries(Object.entries(p).reverse());
    expect(twilioSignature('12345', URL, shuffled)).toBe('RSOYDt4T1cUTdK1PDd93/VVr8B8=');
  });

  it('accepts only the right signature for the URL, params and token', () => {
    const p = params('+14158675309');
    expect(validTwilioSignature('12345', URL, p, 'RSOYDt4T1cUTdK1PDd93/VVr8B8=')).toBe(true);
    expect(validTwilioSignature('12346', URL, p, 'RSOYDt4T1cUTdK1PDd93/VVr8B8=')).toBe(false);
    expect(validTwilioSignature('12345', `${URL}&x=1`, p, 'RSOYDt4T1cUTdK1PDd93/VVr8B8=')).toBe(false);
    expect(validTwilioSignature('12345', URL, { ...p, Digits: '4321' }, 'RSOYDt4T1cUTdK1PDd93/VVr8B8=')).toBe(false);
    expect(validTwilioSignature('12345', URL, p, undefined)).toBe(false);
    expect(validTwilioSignature('12345', URL, p, '')).toBe(false);
    expect(validTwilioSignature('', URL, p, 'RSOYDt4T1cUTdK1PDd93/VVr8B8=')).toBe(false);
  });
});

describe('the policeVoice webhook', () => {
  const BASE = 'https://europe-west2-demo.cloudfunctions.net/policeVoice';
  const TOKEN = 'secret-token';

  function run(req: Partial<VoiceHttpRequest>, reply: VoiceReply = [{ kind: 'hangup' }]) {
    const seen: VoiceRequest[] = [];
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
    const handler = voiceHandler({
      authToken: () => TOKEN,
      voiceUrl: () => BASE,
      handle: async (r) => {
        seen.push(r);
        return reply;
      },
      render: (r) => `<Response>${r.length}</Response>`,
      log: () => {},
    });
    return { done: handler({ method: 'POST', headers: {}, ...req }, res), out, seen };
  }

  const form = (params: Record<string, string>) => Buffer.from(new URLSearchParams(params).toString());
  const params = { CallSid: 'CA1', CallStatus: 'in-progress', Digits: '4' };
  const path = '/policeVoice?call=c1&step=gather&try=1';
  const signed = twilioSignature(TOKEN, `${BASE}?call=c1&step=gather&try=1`, params);

  it('answers a signed request with TwiML, passing our query and Twilio’s params', async () => {
    const r = run({ originalUrl: path, rawBody: form(params), headers: { 'x-twilio-signature': signed } });
    await r.done;
    expect(r.out).toEqual({ code: 200, body: '<Response>1</Response>', type: 'text/xml' });
    expect(r.seen).toEqual([{ query: { call: 'c1', step: 'gather', try: '1' }, params }]);
  });

  it('reads params from a parsed body when there is no raw body', async () => {
    const r = run({ originalUrl: path, body: params, headers: { 'x-twilio-signature': signed } });
    await r.done;
    expect(r.out.code).toBe(200);
  });

  it.each([
    ['no signature', {}],
    ['a wrong signature', { 'x-twilio-signature': 'AAAA' }],
    ['a signature for other params', { 'x-twilio-signature': twilioSignature(TOKEN, `${BASE}?call=c1&step=gather&try=1`, { ...params, Digits: '5' }) }],
    ['a signature from another token', { 'x-twilio-signature': twilioSignature('other', `${BASE}?call=c1&step=gather&try=1`, params) }],
  ])('refuses %s (403) and does nothing', async (_label, headers) => {
    const r = run({ originalUrl: path, rawBody: form(params), headers });
    await r.done;
    expect(r.out.code).toBe(403);
    expect(r.seen).toEqual([]);
  });

  it('refuses anything but POST', async () => {
    const r = run({ method: 'GET', originalUrl: path });
    await r.done;
    expect(r.out.code).toBe(405);
  });

  it('a failure apologises on the line, and fails a status callback loudly', async () => {
    const failing = (query: string) => {
      const out = { code: 0, body: '' };
      const res = {
        status(code: number) {
          out.code = code;
          return res;
        },
        set() {
          return res;
        },
        send(body: string) {
          out.body = body;
        },
      };
      const p = `${BASE}?${query}`;
      const handler = voiceHandler({
        authToken: () => TOKEN,
        voiceUrl: () => BASE,
        handle: async () => {
          throw new Error('boom');
        },
        render: () => '',
        log: () => {},
      });
      return handler({ method: 'POST', originalUrl: `/?${query}`, rawBody: form(params), headers: { 'x-twilio-signature': twilioSignature(TOKEN, p, params) } }, res).then(() => out);
    };
    const voiceOut = await failing('call=c1&step=voice');
    expect(voiceOut.code).toBe(200);
    expect(voiceOut.body).toContain('<Hangup/>');
    expect((await failing('call=c1&step=status')).code).toBe(500);
  });
});

describe('twilioLine', () => {
  const config = { accountSid: 'AC123', authToken: 'tok', callerId: '+447700900000', voiceUrl: 'https://example.test/policeVoice' };

  function fakeFetch(...responses: Array<{ status: number; body: unknown } | Error>) {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fn = (async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error('no more responses');
      if (next instanceof Error) throw next;
      return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    return { fn, requests };
  }

  it('places a call with Basic auth, our webhooks, a 25 s ring, a 60 s cap and voicemail detection', async () => {
    const f = fakeFetch({ status: 201, body: { sid: 'CA9', status: 'queued' } });
    const line = twilioLine({ ...config, fetch: f.fn });
    expect(line.callerId).toBe('+447700900000');
    expect(await line.placeCall({ to: '+447700900001', query: { call: 'c1' } })).toEqual({ sid: 'CA9' });
    const [{ url, init }] = f.requests;
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Calls.json');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('AC123:tok').toString('base64')}`);
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toMatchObject({
      To: '+447700900001',
      From: '+447700900000',
      Url: 'https://example.test/policeVoice?call=c1&step=voice',
      Method: 'POST',
      StatusCallback: 'https://example.test/policeVoice?call=c1&step=status',
      StatusCallbackMethod: 'POST',
      Timeout: '25',
      TimeLimit: '60',
      MachineDetection: 'Enable',
      MachineDetectionTimeout: '10',
    });
    expect(body.getAll('StatusCallbackEvent')).toEqual(['initiated', 'ringing', 'answered', 'completed']);
  });

  it("turns Twilio's refusal into a PhoneLineError with its code, and a network failure into 'network'", async () => {
    const refused = twilioLine({ ...config, fetch: fakeFetch({ status: 400, body: { code: 21215, message: 'Geo permission' } }).fn });
    await expect(refused.placeCall({ to: '+4915123456789', query: { call: 'c1' } })).rejects.toMatchObject({ name: 'PhoneLineError', code: '21215' });
    const down = twilioLine({ ...config, fetch: fakeFetch(new Error('ECONNRESET')).fn });
    const err = await down.placeCall({ to: '+447700900001', query: { call: 'c1' } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PhoneLineError);
    expect(err).toMatchObject({ code: 'network' });
  });

  it('checks the account and its credit without ringing anyone', async () => {
    const f = fakeFetch({ status: 200, body: { status: 'active' } }, { status: 200, body: { balance: '4.12', currency: 'USD' } });
    expect(await twilioLine({ ...config, fetch: f.fn }).health()).toEqual({ ok: true, message: 'Active', balance: '4.12 USD', code: null });
    expect(f.requests.map((r) => r.url)).toEqual([
      'https://api.twilio.com/2010-04-01/Accounts/AC123.json',
      'https://api.twilio.com/2010-04-01/Accounts/AC123/Balance.json',
    ]);
    expect(f.requests.every((r) => !r.init.method || r.init.method === 'GET')).toBe(true);
  });

  it('a suspended account, a refusal or no network is unhealthy, never a throw', async () => {
    const suspended = fakeFetch({ status: 200, body: { status: 'suspended' } }, { status: 200, body: { balance: '0.00', currency: 'USD' } });
    expect(await twilioLine({ ...config, fetch: suspended.fn }).health()).toMatchObject({ ok: false, message: 'The Twilio account is suspended' });
    const refused = fakeFetch({ status: 401, body: { code: 20003, message: 'Authenticate' } });
    expect(await twilioLine({ ...config, fetch: refused.fn }).health()).toMatchObject({ ok: false, code: '20003' });
    expect(await twilioLine({ ...config, fetch: fakeFetch(new Error('down')).fn }).health()).toMatchObject({ ok: false, code: 'network' });
  });

  it('builds webhook URLs from the base, ignoring any query on it', () => {
    expect(voiceUrlFor('https://x.test/policeVoice', { call: 'c1', step: 'voice' })).toBe('https://x.test/policeVoice?call=c1&step=voice');
    expect(voiceUrlFor('https://x.test/policeVoice?old=1', { line: 'u', test: 't' })).toBe('https://x.test/policeVoice?line=u&test=t');
  });
});
