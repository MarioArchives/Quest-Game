// Pieces My file and the other player's file have in common, in the case-file look (E4·1): the top strip, the
// suspect head (a round paperclipped mugshot, the case number, the name and character), the stat boxes, the sealed
// motive and the exhibits folder of clipped prints.
import { useMemo, type ReactNode } from 'react';
import { Avatar } from '../../../components/Avatar';
import { PhotoThumb } from '../../../components/PhotoViewer';
import { useNow } from '../../../data/hooks';
import type { Exhibit } from '../../../lib/exhibits';
import { zone } from '../../../pack';
import { caseNumber, surnameInitial } from '../dossier';
import { Folder, Paperclip } from './CaseKit';
import './myfile.css';

export const PRECINCT = 'Blackwood Manor PD';

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
 * The suspect's head: a round, borderless mugshot with a paperclip (a silhouette without a photo), the case number,
 * the surname-and-initial name and the character line. With `onEditPhoto` (My file) the mugshot and an EDIT PHOTO
 * link open the photo picker.
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
        <span className="mf-mug__clip">
          <Paperclip />
        </span>
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

/** One typed stat box; the score is teal, or red when negative. */
export function Stat({ label, score, negative, children }: { label: string; score?: boolean; negative?: boolean; children: ReactNode }) {
  return (
    <div className={`mf-stat${score ? ' mf-stat--score' : ''}${score && negative ? ' is-neg' : ''}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
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
