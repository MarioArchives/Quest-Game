// Which police phone line a deployment runs, from its environment (functions/.env.<project id>, .env.local in the
// emulators): Twilio's (POLICE_CALLER_ID), the Telegram line (POLICE_LINE=telegram), the simulated one in the
// emulators, or none; and the secrets that line needs, so only those are declared (the CLI asks for every declared
// secret at deploy time).

export type PoliceLineKind = 'twilio' | 'telegram' | 'simulated';

export interface PoliceLineConfig {
  kind: PoliceLineKind | null;
  secrets: string[];
}

export function policeLineConfig(env: Record<string, string | undefined>): PoliceLineConfig {
  const emulator = env.FUNCTIONS_EMULATOR === 'true';
  // The line asked for wins; in the emulators nothing rings anyone unless the Telegram line is asked for.
  if (env.POLICE_LINE?.trim().toLowerCase() === 'telegram') return { kind: 'telegram', secrets: ['TELEGRAM_LINE_SECRET'] };
  if (emulator) return { kind: 'simulated', secrets: [] };
  if ((env.POLICE_CALLER_ID?.trim() ?? '') !== '') return { kind: 'twilio', secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] };
  return { kind: null, secrets: [] };
}
