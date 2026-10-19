// The phone line the police ring from: injected like the Store, so the game rules never talk to Twilio themselves.
// functions/src/firebase/twilio.ts is the real one (Twilio's REST API); tests use a fake; the mock backend and the
// emulators have the simulated one (./simulatedLine.ts: the app plays the phone); a deployment without Twilio has
// none, which the game treats as phone calls not being set up.

/** What placing a call needs: who to ring, and what to add to the webhook's address so its answers find the call. */
export interface PlaceCall {
  /** E.164. */
  to: string;
  /** Added to the voice webhook's URL for every request about this call, e.g. { call: '<policeCalls id>' }. */
  query: Record<string, string>;
}

/** How the account looks, without ringing anyone. */
export interface LineHealth {
  ok: boolean;
  /** "Active", or what is wrong ("Twilio error 20003: …"). */
  message: string;
  /** The account's credit, e.g. "4.12 USD", when Twilio said. */
  balance: string | null;
  /** Twilio's error code when the check itself was refused. */
  code: string | null;
}

export interface PhoneLine {
  /** The number calls come from (the verified caller ID), for the players' contact card. */
  readonly callerId: string;
  /** Rings `to`. Resolves with Twilio's call id; rejects with a PhoneLineError when the call is refused. */
  placeCall(call: PlaceCall): Promise<{ sid: string }>;
  /** A look at the account (status and credit). Never throws: a failure is `ok: false`. */
  health(): Promise<LineHealth>;
}

/** The provider refused a call: `code` is its error code ("21215"), or "network" when it couldn't be reached. */
export class PhoneLineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PhoneLineError';
    this.code = code;
  }
}
