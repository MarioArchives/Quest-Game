// Standing pins on the Board: an enamel pin on a face, a phone for a trusted confidant (they can call the police) and
// an eye for a person of interest (being watched), and the key under the standings that says what each one means.
import { Icon, type IconName } from '../../../components/Icon';
import { t } from '../../../pack';
import type { PlayerStanding } from '../../../shared';
import type { StandingKeyLine } from './standingKey';

const ICON: Record<PlayerStanding, IconName> = { confidant: 'phone', poi: 'eye' };

/** The pack's nouns for a standing: .One for a heading, .one mid-sentence. */
export const standingNoun = (standing: PlayerStanding) => (standing === 'confidant' ? t.confidant : t.poi);

/** The pin itself; decorative (the row's label says the standing). Board CSS places it on the face. */
export function StandingPin({ standing }: { standing: PlayerStanding }) {
  return (
    <span className={`st__pin st__pin--${standing}`} aria-hidden="true">
      <Icon name={ICON[standing]} strokeWidth={2.6} />
    </span>
  );
}

/** The key at the foot of the standings (see standingKeyLines): nothing when neither standing is switched on. */
export function StandingKey({ lines }: { lines: readonly StandingKeyLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="st__legend" aria-label="Key to the pins">
      {lines.map((line) => (
        <li key={line.standing} className={`st__lg st__lg--${line.standing}`}>
          <StandingPin standing={line.standing} />
          <span>
            <b>{standingNoun(line.standing).One}</b> {line.rule}
            {line.brings ? ` · ${line.brings}` : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
