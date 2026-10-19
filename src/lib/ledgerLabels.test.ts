// Engine plan edge case 21: one table of points-history labels, complete and in the pack's words.
import { describe, expect, it } from 'vitest';
import { termForms } from '../../functions/src/shared/packs/terms.ts';
import { LEDGER_REASON_LIST } from '../../functions/src/shared/types.ts';
import { getPack } from '../../functions/src/shared/packs/index.ts';
import { ledgerLabels, type LedgerVoice } from './ledgerLabels';

const dare = () =>
  termForms({
    quest: { one: 'dare', many: 'dares' },
    sideQuest: { one: 'showdown', many: 'showdowns' },
    witness: { one: 'judge', many: 'judges' },
    claim: { one: 'bid', many: 'bids' },
    gm: { one: 'host', many: 'hosts' },
    wrap: { one: 'recap', many: 'recaps' },
  });

describe('ledgerLabels', () => {
  it.each(['you', 'them', 'gm'] as LedgerVoice[])('has a label for every reason (%s)', (voice) => {
    const labels = ledgerLabels(dare(), voice);
    for (const reason of LEDGER_REASON_LIST) expect(labels[reason]?.trim(), reason).toBeTruthy();
    expect(Object.keys(labels).sort()).toEqual([...LEDGER_REASON_LIST].sort());
  });

  it('keeps the Lancaster wording exactly', () => {
    const t = termForms(getPack('lancaster').terms);
    const them = ledgerLabels(t, 'them');
    expect(them).toMatchObject({
      quest: 'Quest approved',
      'global-win': 'Won a side quest',
      'global-entry': 'Entered a side quest',
      exposed: 'Their quest was exposed',
      'guess-correct': 'Guessed right',
      'guess-wrong': 'Guessed wrong',
      adjust: 'GM adjustment',
      reversal: 'Approval reversed',
      fraud: 'Overruled as fraud',
      rejected: 'Claim rejected',
    });
    expect(ledgerLabels(t, 'you').exposed).toBe('Your quest was exposed');
    expect(ledgerLabels(t, 'gm').exposed).toBe('Quest exposed');
  });

  it('names the new reasons', () => {
    const t = termForms(getPack('lancaster').terms);
    expect(ledgerLabels(t, 'them').witness).toBe('Witness reward');
    expect(ledgerLabels(t, 'them').bounty).toBe('Bounty from a wrong guess');
  });

  it('names the reward and skip reasons, never naming who framed whom (mystery plan E17)', () => {
    const t = dare();
    expect(ledgerLabels(t, 'you')).toMatchObject({ cleared: 'Cleared your name', framed: 'You were framed', skipped: 'Skipped a showdown' });
    expect(ledgerLabels(t, 'them')).toMatchObject({ cleared: 'Cleared their name', framed: 'They were framed', skipped: 'Skipped a showdown' });
    expect(ledgerLabels(t, 'gm')).toMatchObject({ cleared: 'Name cleared', framed: 'Framed', skipped: 'Skipped a showdown' });
  });

  it("uses the pack's words", () => {
    const labels = ledgerLabels(dare(), 'you');
    expect(labels.quest).toBe('Dare approved');
    expect(labels['global-win']).toBe('Won a showdown');
    expect(labels.exposed).toBe('Your dare was exposed');
    expect(labels.adjust).toBe('Host adjustment');
    expect(labels.rejected).toBe('Bid rejected');
    expect(labels.witness).toBe('Judge reward');
    for (const label of Object.values(labels)) expect(label).not.toMatch(/quest|witness|\bGM\b|claim/i);
  });

  it('labels votes received (plan "Mystery pack: minimal notifications, Bob\'s story arc…", edge case 30)', () => {
    const t = termForms(getPack('mystery').terms);
    expect((ledgerLabels(t, 'you') as Record<string, string>)['global-votes']).toMatch(/votes?/i);
    expect((ledgerLabels(t, 'gm') as Record<string, string>)['global-votes']).toMatch(/votes?/i);
  });
});
