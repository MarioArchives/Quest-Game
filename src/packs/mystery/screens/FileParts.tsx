// Pieces My file and the other player's file have in common, in the case-file look (E4·1): the top strip, the
// classification band and police tape across the top of the suspect folder, the suspect head (a round mugshot, the
// case number, the name and character), the stat boxes, the particulars from the booking desk, the sealed motive and
// the exhibits folder of clipped prints.
import { useMemo, type ReactNode } from 'react';
import { Avatar } from '../../../components/Avatar';
import { Icon } from '../../../components/Icon';
import { PhotoThumb } from '../../../components/PhotoViewer';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useNow } from '../../../data/hooks';
import type { Exhibit } from '../../../lib/exhibits';
import { t, zone } from '../../../pack';
import { caseNumber, surnameInitial } from '../dossier';
import { standingWord } from '../../../screens/home/StandingBadge';
import type { Particulars, PlayerStanding } from '../../../shared';
import { makePrint } from '../booking/fingerprint';
import { PrintArt } from '../booking/Print';
import { feetInches } from '../booking/suspect';
import { Folder, Paperclip } from './CaseKit';
import { bandFor, tapeTimeLeft } from './standingBand';
import './myfile.css';

export const PRECINCT = 'Manchester Metropolitan Police';

/** hh:mm in the pack's time zone, ticking. */
function RecClock() {
  const now = useNow(15_000);
  const time = useMemo(
    () => new Intl.DateTimeFormat(zone.locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone.timeZone }).format(now),
    [now],
  );
  return (
    <div className="mf-rec">
      <span className="mf-rec__dot" aria-hidden="true" />
      REC {time}
    </div>
  );
}

/** "Interview room B" and the REC clock. */
export function TopStrip() {
  return (
    <div className="mf-top">
      <div className="mf-top__room">Interview room B</div>
      <RecClock />
    </div>
  );
}

/**
 * The suspect's head: a round, borderless mugshot (a silhouette without a photo), the case number, the
 * surname-and-initial name and the character line. With `onEditPhoto` (My file) the mugshot and an EDIT PHOTO link
 * open the photo picker. The paperclip is on its folder's tab (`clip="tab"`).
 */
export function SuspectHead({
  photo,
  name,
  displayName,
  uid,
  line,
  onEditPhoto,
  children,
}: {
  photo: string | null;
  /** The character's name, or the player's. */
  name: string;
  displayName: string;
  uid: string;
  line: string;
  onEditPhoto?: () => void;
  /** Extra lines under the character line (a status stamp). */
  children?: ReactNode;
}) {
  const mug = <Avatar name={displayName} src={photo} size={104} uid={uid} className="mf-mug__face" />;
  return (
    <div className="mf-head">
      <div className="mf-mug">
        {onEditPhoto ? (
          <button type="button" className="mf-mug__btn" aria-label="Change your photo" onClick={onEditPhoto}>
            {mug}
          </button>
        ) : (
          mug
        )}
      </div>
      <div className="mf-head__who">
        <span className="cf-meta">Case {caseNumber(uid)}</span>
        <h2 className="mf-head__name">{surnameInitial(name)}</h2>
        <p className="mf-head__line">{line}</p>
        {onEditPhoto ? (
          <button type="button" className="mf-link mf-link--btn" onClick={onEditPhoto}>
            Edit photo
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/**
 * The classification band printed across the top of a suspect folder (its first child): CLEARED (FOR NOW) in teal for
 * a trusted confidant, WATCH LIST in red for a person of interest, with the standing's name and the line it was drawn
 * on. Live from the points and the GM's lines, so it comes and goes as they move; nothing with no standing, or once
 * the player has left. Read out as one line: "Standing: Watch list, person of interest, score below −10".
 */
export function StandingBand({ points, left }: { points: number | null | undefined; left: boolean }) {
  const { settings } = useGame();
  const band = bandFor(points, left, settings);
  if (!band) return null;
  return (
    <p className={`mf-band mf-band--${band.standing}`}>
      <span className="visually-hidden">Standing: </span>
      <span className="mf-band__word">
        <BandMark standing={band.standing} />
        <span>{band.word}</span>
      </span>
      <span className="visually-hidden">, </span>
      <span className="mf-band__what">
        <span>{standingWord(band.standing)}</span>
        <span className="visually-hidden">, </span>
        <span className="mf-band__rule">{band.rule}</span>
      </span>
    </p>
  );
}

/** The band's mark: the same pins as the Board's standings, a phone for cleared and an open eye for watched. */
function BandMark({ standing }: { standing: PlayerStanding }) {
  return <Icon className="mf-band__mark" name={standing === 'confidant' ? 'phone' : 'eye'} size={14} strokeWidth={2.6} />;
}

/**
 * Police tape across your own folder while your police check-in is open, with the time left; gone once the time is
 * up. Your own file only: nobody else can read your check-ins.
 */
export function PoliceTape() {
  const { myPoliceCall, state } = useGame();
  if (!myPoliceCall || state.status === 'ended') return null;
  return <Tape endsAt={tsMs(myPoliceCall.endsAt)} />;
}

function Tape({ endsAt }: { endsAt: number }) {
  const now = useNow(5_000);
  const left = tapeTimeLeft(endsAt, now);
  if (!left) return null;
  const text = `${t.policeCall.One} open · ${left}`;
  return (
    <p className="mf-tape">
      <span className="visually-hidden">{text}</span>
      {/* Printed over and over along the tape; the folder's edge cuts it off. */}
      <span className="mf-tape__text" aria-hidden="true">
        {[text, text, text].join(' · ')}
      </span>
    </p>
  );
}

/** One typed stat box; the score is teal, or red when negative. */
export function Stat({ label, score, negative, children }: { label: string; score?: boolean; negative?: boolean; children: ReactNode }) {
  return (
    <div className={`mf-stat${score ? ' mf-stat--score' : ''}${score && negative ? ' is-neg' : ''}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * What they told the booking desk, typed beside the inked print of their right thumb (made up from the player, as at
 * the desk). Nothing for a player with no particulars on file (booked before the desk, or never through it).
 */
export function ParticularsSlip({ uid, particulars }: { uid: string; particulars: Particulars | null | undefined }) {
  const print = useMemo(() => makePrint(uid), [uid]);
  if (!particulars) return null;
  const { heightCm, drink, marks } = particulars;
  return (
    <div className="mf-parts">
      <div className="mf-parts__print">
        <PrintArt print={print} tone="ink" className="mf-parts__ink" />
        <span>R. thumb</span>
      </div>
      <dl className="mf-parts__rows">
        {heightCm ? (
          <div>
            <dt>Height</dt>
            <dd>
              {heightCm} cm · {feetInches(heightCm)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Poison</dt>
          <dd>{drink ?? 'Won’t say'}</dd>
        </div>
        {marks ? (
          <div className="mf-parts__marks">
            <dt>Marks</dt>
            <dd>{marks}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/** The motive as a note sealed with red wax. */
export function SealedNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mf-sealed">
      <span className="mf-wax" aria-hidden="true" />
      <div className="mf-sealed__label">{label}</div>
      {children}
    </div>
  );
}

/**
 * The motives written about a player once their mission has closed: the approved entries of a mission whose entries
 * name an assigned player, with the author and the words. Nothing shows until there is one.
 */
export function MotivesFolder({ uid }: { uid: string }) {
  const { approved, globalQuests, playersById } = useGame();
  const assigned = new Set(globalQuests.filter((q) => q.entry?.tag === 'assigned').map((q) => q.id));
  const motives = approved.filter((s) => s.kind === 'global' && s.taggedUid === uid && assigned.has(s.questId ?? '') && s.caption);
  if (motives.length === 0) return null;
  return (
    <Folder tab={`Motives · ${motives.length}`} label="Motives" clip={false}>
      <ul className="mf-motives">
        {motives.map((m) => (
          <li key={m.id}>
            <q>{m.caption}</q>
            <small>{playersById.get(m.uid)?.displayName ?? 'A player'}</small>
          </li>
        ))}
      </ul>
    </Folder>
  );
}

/** The exhibits folder: group-mission photos as clipped prints with their captions. `action` sits under the tab. */
export function ExhibitsFolder({ exhibits, action, empty }: { exhibits: Exhibit[]; action?: ReactNode; empty: string }) {
  return (
    <Folder tab={`Exhibits · ${exhibits.length}`} label="Exhibits">
      {action ? <div className="mf-folder-action">{action}</div> : null}
      {exhibits.length === 0 ? (
        <p className="mf-muted">{empty}</p>
      ) : (
        <ul className="mf-exhibits">
          {exhibits.map((e, i) => (
            <li key={e.submissionId} className="mf-exhibit" style={{ transform: `rotate(${i % 2 === 0 ? -1.4 : 1.1}deg)` }}>
              <div className="cf-print mf-exhibit__print">
                <PhotoThumb submissionId={e.submissionId} thumbPath={e.thumbPath} fill label={`Exhibit: ${e.caption}`} />
              </div>
              <span className="mf-exhibit__clip">
                <Paperclip />
              </span>
              <div className="mf-exhibits__cap">{e.caption}</div>
            </li>
          ))}
        </ul>
      )}
    </Folder>
  );
}
