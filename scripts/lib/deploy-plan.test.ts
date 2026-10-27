// Deploy plan edge cases D1–D14: what `npm run deploy` checks before anything reaches the live project, what it
// builds with, in what order it deploys and what it reminds you of afterwards.
import { describe, expect, it } from 'vitest';
import { packIds } from '../../functions/src/shared/packs/index.ts';
import {
  buildEnv,
  checkBundle,
  checkNode,
  checkPacks,
  checkSecrets,
  checkWebEnv,
  consentProblem,
  deploySteps,
  functionsEnv,
  parseArgs,
  parseEnvFile,
  prodAlias,
  reminders,
  secretsNeeded,
  USAGE,
} from './deploy-plan.mjs';

const PROJECT = 'musical-mischief';

/** A complete .env.production.local for the live project. */
const WEB_ENV = {
  VITE_GAME_PACK: 'mystery',
  VITE_USE_EMULATORS: 'false',
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: PROJECT,
  VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT}.firebasestorage.app`,
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
  VITE_FIREBASE_VAPID_KEY: 'vapid',
};

describe('D1. arguments', () => {
  it('with none, deploys everything and asks first', () => {
    expect(parseArgs([])).toEqual({ targets: ['rules', 'functions', 'web'], dryRun: false, skipTests: false, yes: false });
  });

  it('--only takes a comma list or one target, either spelling, kept in deploy order', () => {
    expect(parseArgs(['--only', 'web,rules']).targets).toEqual(['rules', 'web']);
    expect(parseArgs(['--only=functions']).targets).toEqual(['functions']);
    expect(parseArgs(['--only', 'web', '--only', 'functions']).targets).toEqual(['functions', 'web']);
  });

  it('reads the switches', () => {
    expect(parseArgs(['--dry-run', '--skip-tests', '--yes'])).toMatchObject({ dryRun: true, skipTests: true, yes: true });
  });

  it.each([
    ['an unknown target', ['--only', 'web,nope'], /nope/],
    ['--only with nothing after it', ['--only'], /--only/],
    ['an unknown flag', ['--force'], /--force/],
  ])('refuses %s, with the usage line', (_label, argv, why) => {
    expect(() => parseArgs(argv)).toThrow(why);
    expect(() => parseArgs(argv)).toThrow(USAGE);
  });
});

describe('D2. Node', () => {
  it('takes Node 24 and later', () => {
    expect(checkNode('v24.13.1')).toBeNull();
    expect(checkNode('v25.0.0')).toBeNull();
  });

  it('refuses older Node, saying how to switch', () => {
    expect(checkNode('v20.19.0')).toMatch(/Node 24/);
    expect(checkNode('v20.19.0')).toContain('export PATH=~/.nvm/versions/node/v24.13.1/bin:$PATH');
  });
});

describe('D3. the live project', () => {
  it('is the prod alias in .firebaserc', () => {
    expect(prodAlias({ projects: { default: 'demo-quest-game', prod: PROJECT } })).toBe(PROJECT);
  });

  it('no prod alias is an error saying how to add one', () => {
    expect(() => prodAlias({ projects: { default: 'demo-quest-game' } })).toThrow(/firebase use --add/);
    expect(() => prodAlias({})).toThrow(/prod/);
  });
});

describe('env files', () => {
  it('parseEnvFile reads KEY=value lines, skipping comments and blanks, and unquotes values', () => {
    expect(parseEnvFile('# a comment\n\nGAME_PACK=mystery\nPOLICE_LINE="telegram"\n  SPACED = yes \nURL=https://a.b/c?d=e\n')).toEqual({
      GAME_PACK: 'mystery',
      POLICE_LINE: 'telegram',
      SPACED: 'yes',
      URL: 'https://a.b/c?d=e',
    });
  });
});

describe('D4–D6, D8. the web build’s env file', () => {
  it('passes a complete file for the live project', () => {
    expect(checkWebEnv(WEB_ENV, PROJECT)).toEqual({ errors: [], warnings: [] });
  });

  it('D4. a missing file is an error', () => {
    expect(checkWebEnv(null, PROJECT).errors.join(' ')).toContain('.env.production.local');
  });

  it('D4. names every missing key', () => {
    const { VITE_FIREBASE_API_KEY: _a, VITE_FIREBASE_APP_ID: _b, ...rest } = WEB_ENV;
    const { errors } = checkWebEnv(rest, PROJECT);
    expect(errors.join(' ')).toContain('VITE_FIREBASE_API_KEY');
    expect(errors.join(' ')).toContain('VITE_FIREBASE_APP_ID');
  });

  it('D4. a missing pack is an error', () => {
    const { VITE_GAME_PACK: _p, ...rest } = WEB_ENV;
    expect(checkWebEnv(rest, PROJECT).errors.join(' ')).toContain('VITE_GAME_PACK');
  });

  it('D5. another project is an error', () => {
    const { errors } = checkWebEnv({ ...WEB_ENV, VITE_FIREBASE_PROJECT_ID: 'demo-quest-game' }, PROJECT);
    expect(errors.join(' ')).toContain('demo-quest-game');
    expect(errors.join(' ')).toContain(PROJECT);
  });

  it('D6. the emulators or the mock backend are an error', () => {
    expect(checkWebEnv({ ...WEB_ENV, VITE_USE_EMULATORS: 'true' }, PROJECT).errors.join(' ')).toContain('VITE_USE_EMULATORS');
    expect(checkWebEnv({ ...WEB_ENV, VITE_BACKEND: 'mock' }, PROJECT).errors.join(' ')).toContain('VITE_BACKEND');
  });

  it('D8. no VAPID key is only a warning', () => {
    const { VITE_FIREBASE_VAPID_KEY: _v, ...rest } = WEB_ENV;
    const { errors, warnings } = checkWebEnv(rest, PROJECT);
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toContain('VITE_FIREBASE_VAPID_KEY');
  });
});

describe('D7. the functions run the same pack as the site', () => {
  it('reads the functions’ env files in Firebase’s order: .env, then .env.<project id>, then .env.prod', () => {
    expect(functionsEnv({ base: 'GAME_PACK=lancaster\n', byId: null, byAlias: null })).toEqual({ GAME_PACK: 'lancaster' });
    expect(functionsEnv({ base: 'GAME_PACK=lancaster\nA=1\n', byId: 'GAME_PACK=mystery\n', byAlias: null })).toEqual({ GAME_PACK: 'mystery', A: '1' });
    expect(functionsEnv({ base: 'GAME_PACK=lancaster\n', byId: 'GAME_PACK=mystery\n', byAlias: 'GAME_PACK=starter\n' }).GAME_PACK).toBe('starter');
    expect(functionsEnv({ base: null, byId: null, byAlias: null })).toEqual({});
  });

  it('passes when both name the same known pack', () => {
    expect(checkPacks('mystery', 'mystery', packIds())).toEqual([]);
  });

  it('a mismatch is an error naming both', () => {
    const errors = checkPacks('mystery', 'lancaster', packIds()).join(' ');
    expect(errors).toContain('mystery');
    expect(errors).toContain('lancaster');
  });

  it('an unknown or missing pack is an error', () => {
    expect(checkPacks('nope', 'nope', packIds()).join(' ')).toContain('nope');
    expect(checkPacks('mystery', undefined, packIds())).not.toEqual([]);
  });
});

describe('D9. the secrets the functions declare', () => {
  it('none by default, the Telegram line’s with POLICE_LINE=telegram, Twilio’s with POLICE_CALLER_ID', () => {
    expect(secretsNeeded({ GAME_PACK: 'mystery' })).toEqual([]);
    expect(secretsNeeded({ POLICE_LINE: 'telegram' })).toEqual(['TELEGRAM_LINE_SECRET']);
    expect(secretsNeeded({ POLICE_CALLER_ID: '+447700900123' })).toEqual(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
  });

  it('a missing one is an error naming it', () => {
    expect(checkSecrets(['TELEGRAM_LINE_SECRET'], ['TELEGRAM_LINE_SECRET', 'OTHER'])).toEqual([]);
    expect(checkSecrets(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'], ['TWILIO_ACCOUNT_SID']).join(' ')).toContain('TWILIO_AUTH_TOKEN');
  });
});

describe('D10. the build’s environment', () => {
  it('drops every VITE_* from the shell, so only .env.production.local counts, and keeps the rest', () => {
    const env = buildEnv({ PATH: '/bin', HOME: '/home/x', VITE_USE_EMULATORS: 'true', VITE_GAME_PACK: 'lancaster', NODE_ENV: 'production' });
    expect(env).toEqual({ PATH: '/bin', HOME: '/home/x', NODE_ENV: 'production' });
  });
});

describe('D11. deploy order', () => {
  it.each([
    [['rules', 'functions', 'web'], ['firestore,storage,functions', 'hosting']],
    [['web'], ['hosting']],
    [['rules'], ['firestore,storage']],
    [['functions'], ['functions']],
    [['rules', 'web'], ['firestore,storage', 'hosting']],
    [['functions', 'web'], ['functions', 'hosting']],
  ])('%j deploys %j, the backend before the site', (targets, steps) => {
    expect(deploySteps(targets)).toEqual(steps);
  });
});

describe('D12. reminders after a deploy', () => {
  it('seeding, when the pack’s quests changed', () => {
    const { lines, note } = reminders({ changed: ['functions/src/shared/packs/mystery/quests.json', 'src/App.tsx'], pack: 'mystery', lastCommit: 'abc123' });
    expect(note).toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('npm run seed -- --prod --pack mystery');
  });

  it('nothing for another pack’s quests', () => {
    expect(reminders({ changed: ['functions/src/shared/packs/lancaster/quests.json'], pack: 'mystery', lastCommit: 'abc123' }).lines).toEqual([]);
  });

  it('copying the police script to the VM, when it changed', () => {
    const { lines } = reminders({ changed: ['services/telegram-police/police_call.py'], pack: 'mystery', lastCommit: 'abc123' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('police-line');
  });

  it('with no earlier deploy recorded, a note and no reminders', () => {
    const { lines, note } = reminders({ changed: ['functions/src/shared/packs/mystery/quests.json'], pack: 'mystery', lastCommit: null });
    expect(lines).toEqual([]);
    expect(note).toBeTruthy();
  });
});

describe('D13. the built site', () => {
  const good = `const c={projectId:"${PROJECT}",authDomain:"${PROJECT}.firebaseapp.com"};`;

  it('passes a bundle for the live project', () => {
    expect(checkBundle(good, PROJECT)).toEqual([]);
  });

  it('fails without the project id', () => {
    expect(checkBundle('const c={};', PROJECT).join(' ')).toContain(PROJECT);
  });

  it('fails on the demo project or an emulator host', () => {
    expect(checkBundle(`${good}const d="demo-quest-game";`, PROJECT)).not.toEqual([]);
    expect(checkBundle(`${good}connect("127.0.0.1",8080);`, PROJECT)).not.toEqual([]);
  });
});

describe('D14. asking first', () => {
  it('a terminal is asked', () => {
    expect(consentProblem({ tty: true, yes: false, dryRun: false })).toBeNull();
  });

  it('--yes, or a dry run, needs no terminal', () => {
    expect(consentProblem({ tty: false, yes: true, dryRun: false })).toBeNull();
    expect(consentProblem({ tty: false, yes: false, dryRun: true })).toBeNull();
  });

  it('without a terminal and without --yes it refuses', () => {
    expect(consentProblem({ tty: false, yes: false, dryRun: false })).toMatch(/--yes/);
  });
});
