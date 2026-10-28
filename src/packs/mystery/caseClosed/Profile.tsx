// The last paper: your detective profile, a full broadsheet page. Your mugshot and who you were to Bob, where you
// finished, then your achievements as stories in two columns and the motive filed against you. The GM, with no file
// of their own, gets the night's honours instead: every award with its winners' mugshots.
import { Masthead, Redacted, Stamp } from './art';
import type { AwardStory } from './awards';
import { Mugshot, type MugPerson } from './Mugshot';
import type { Edition } from './Paper';

export interface ProfileData {
  name: string;
  person: MugPerson;
  /** "Bob's best friend", from the booking desk; null if they never said. */
  relation: string | null;
  relationId: string | null;
  bookedAt: number | null;
  rank: number;
  of: number;
  points: number;
  standing: 'confidant' | 'poi' | null;
  stories: AwardStory[];
  /** The motive filed against them, and who filed it. */
  motive: { text: string; by: string | null } | null;
}

/** A line about each relation the booking desk offers. */
const BLURB: Record<string, string> = {
  lover: 'Shared Bob’s last bottle of wine and most of his secrets.',
  ex: 'Still had a key to Bob’s flat, and opinions about it.',
  sidepiece: 'Saw Bob on Tuesdays. Only ever on Tuesdays.',
  'best-friend': 'Knew Bob for twenty years and spent the night proving it.',
  boss: 'Signed Bob’s payslips and, allegedly, little else.',
  parent: 'Taught Bob to ride a bike, and never let him forget it.',
  sibling: 'Fought Bob over the remote for thirty years.',
  complicated: 'It was complicated. It still is.',
};

const curly = (s: string) => s.replace(/'/g, '’');

export function ProfileSheet({
  data,
  edition,
  at,
  total,
  place,
  closing,
}: {
  data: ProfileData;
  edition: Edition;
  at: number;
  /** How many awards there are. */
  total: number;
  /** "Third of six, 22 points." */
  place: string;
  /** The last line: the case is closed, or still open. */
  closing: string;
}) {
  const standing = data.standing === 'confidant' ? 'A trusted confidant.' : data.standing === 'poi' ? 'A person of interest.' : null;
  return (
    <div className="cc-sheet" lang="en-GB">
      <Masthead issue={edition.issue} edition="p. 1" date={edition.date(at)} strap={`Profile ${data.rank} of ${data.of}`} />
      <h2 className="cc-hl cc-hl--xl">Detective profiles: {data.name}</h2>
      <div className="cc-sheet__grid">
        <figure>
          <Mugshot person={data.person} className="cc-mug--news cc-sheet__mug" />
          <figcaption>
            {data.name}
            {data.bookedAt !== null ? `, booked in at ${edition.time(data.bookedAt)}` : ''}. Case {data.person.caseNo}.
          </figcaption>
        </figure>
        <aside>
          <h4>{data.relation ? curly(data.relation.charAt(0).toUpperCase() + data.relation.slice(1)) : 'Known to police'}</h4>
          <p>{(data.relationId && BLURB[data.relationId]) || 'Says they barely knew Bob. Police are not so sure.'}</p>
          <Redacted lines={2} seed="pfa" />
          <p>
            {place}
            {standing ? ` ${standing}` : ''}
          </p>
          <Redacted lines={3} seed="pfb" />
        </aside>
      </div>
      <section className="cc-sheet__ach">
        <h3 className="cc-band">
          <span>Achievements</span>
          <span>
            {data.stories.length} of {total}
          </span>
        </h3>
        <div className="cc-sheet__cols">
          {data.stories.map((s) => (
            <article key={s.id} className="cc-ach">
              <Stamp name={s.name} tone={s.tone} icon={s.icon} />
              <p className="cc-kick">{s.name}</p>
              <h4>{s.headline}</h4>
              <p>{s.story}</p>
              <Redacted lines={3} seed={s.id} />
            </article>
          ))}
          {data.stories.length === 0 ? (
            <article className="cc-ach">
              <p className="cc-kick">No achievements</p>
              <h4>Nothing on file</h4>
              <p>The Post wishes {data.name} better luck on the next case.</p>
            </article>
          ) : null}
          {data.motive ? (
            <article className="cc-ach cc-ach--motive">
              <p className="cc-kick">On file</p>
              <h4>The motive against you</h4>
              <p>
                “{data.motive.text.trim()}” {data.motive.by ? `Filed by ${data.motive.by}.` : 'Filed by the police.'}
              </p>
              <Redacted lines={2} seed="mot" />
            </article>
          ) : null}
        </div>
        <p className="cc-sheet__end">{closing}</p>
        <Redacted lines={4} seed="end" />
      </section>
    </div>
  );
}

export function HonoursSheet({
  stories,
  person,
  edition,
  at,
  closing,
}: {
  stories: AwardStory[];
  person: (uid: string) => MugPerson | null;
  edition: Edition;
  at: number;
  closing: string;
}) {
  return (
    <div className="cc-sheet" lang="en-GB">
      <Masthead issue={edition.issue} edition="p. 1" date={edition.date(at)} strap="Honours list" />
      <h2 className="cc-hl cc-hl--xl">The night’s honours</h2>
      <div className="cc-honours">
        {stories.map((s) => (
          <article key={s.id} className={`cc-honour${s.uids.length > 1 ? ' is-group' : ''}`}>
            {s.uids.length === 1 ? <Mugshot person={person(s.uids[0])} className="cc-mug--news" /> : null}
            <div className="cc-honour__t">
              <p className="cc-kick">{s.name}</p>
              <h4>{s.headline}</h4>
              {s.uids.length > 1 ? (
                <div className="cc-honour__mugs">
                  {s.uids.map((uid) => (
                    <Mugshot key={uid} person={person(uid)} plate={false} className="cc-mug--news" />
                  ))}
                </div>
              ) : null}
              <p>{s.story}</p>
            </div>
          </article>
        ))}
        {stories.length === 0 ? <p className="cc-sheet__end">No honours tonight: nobody did enough to make the papers.</p> : null}
      </div>
      <p className="cc-sheet__end">{closing}</p>
    </div>
  );
}
