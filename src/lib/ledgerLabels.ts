// One table of points-history labels, in the pack's words.
import type { TermForms } from '../../functions/src/shared/packs/terms.ts';
import type { LedgerReason } from '../shared';

/** Who the line is about: the viewer ("Your quest was exposed"), another player ("Their …") or the GM's log ("Quest exposed"). */
export type LedgerVoice = 'you' | 'them' | 'gm';

export function ledgerLabels(t: TermForms, voice: LedgerVoice): Record<LedgerReason, string> {
  const exposed = { you: `Your ${t.quest.one} was exposed`, them: `Their ${t.quest.one} was exposed`, gm: `${t.quest.One} exposed` };
  return {
    quest: `${t.quest.One} approved`,
    'global-win': `Won a ${t.sideQuest.one}`,
    'global-entry': `Entered a ${t.sideQuest.one}`,
    exposed: exposed[voice],
    'guess-correct': 'Guessed right',
    'guess-wrong': 'Guessed wrong',
    adjust: `${t.gm.One} adjustment`,
    reversal: 'Approval reversed',
    fraud: 'Overruled as fraud',
    rejected: `${t.claim.One} rejected`,
    witness: `${t.witness.One} reward`,
    bounty: 'Bounty from a wrong guess',
  };
}
