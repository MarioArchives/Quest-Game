// One edition, folded: the top half of the Evening Post's front page as it lands on the desk. Its headline, the photo
// with a short piece beside it, and columns blacked out so the eye goes to what matters.
import type { CSSProperties } from 'react';
import { StorageImg } from '../../../screens/wrap/cards';
import { BobPassport, Lineup, Masthead, Redacted } from './art';
import { Mugshot, type MugPerson } from './Mugshot';
import type { Paper } from './papers';

export interface Pose {
  x: number;
  y: number;
  r: number;
}

export interface Edition {
  issue: string;
  date: (ms: number) => string;
  time: (ms: number) => string;
}

function Visual({ paper, person }: { paper: Paper; person: (uid: string) => MugPerson | null }) {
  const v = paper.visual;
  switch (v.kind) {
    case 'bob':
      return (
        <span className="cc-photo cc-photo--news">
          <BobPassport />
        </span>
      );
    case 'lineup':
      return (
        <span className="cc-photo cc-photo--news">
          <Lineup count={v.count} />
        </span>
      );
    case 'photo':
      return (
        <span className="cc-photo cc-photo--news">
          <StorageImg path={v.imagePath} fallbackPath={v.thumbPath} />
        </span>
      );
    case 'clock':
      return (
        <span className="cc-clock">
          <b>{v.time}</b>
          <span>{v.day}</span>
        </span>
      );
    case 'mug':
      return <Mugshot person={person(v.uid)} className="cc-mug--news cc-paper__mug" />;
    case 'unknown':
      return <Mugshot person={null} className="cc-mug--news cc-paper__mug" />;
  }
}

export function PaperView({ paper, pose, edition, person, landing }: { paper: Paper; pose: Pose; edition: Edition; person: (uid: string) => MugPerson | null; landing: boolean }) {
  return (
    <article
      className={`cc-paper${landing ? ' is-landing' : ''}`}
      style={{ '--x': `${pose.x}px`, '--y': `${pose.y}px`, '--r': `${pose.r}deg` } as CSSProperties}
      lang="en-GB"
    >
      <Masthead issue={edition.issue} edition={`${edition.time(paper.at)} edition`} date={edition.date(paper.at)} strap="Late final" />
      <p className="cc-kick">{paper.kicker}</p>
      <h3 className={`cc-hl${paper.red ? ' cc-hl--red' : ''}`}>{paper.headline}</h3>
      <div className="cc-paper__grid">
        <figure>
          <Visual paper={paper} person={person} />
          <figcaption>{paper.caption}</figcaption>
        </figure>
        <aside>
          <h4>{paper.side}</h4>
          <p>{paper.stand}</p>
          <Redacted lines={6} seed={`${paper.id}a`} />
          {paper.more ? <p>{paper.more}</p> : null}
        </aside>
      </div>
      <div className="cc-paper__cols" aria-hidden="true">
        {[0, 1, 2].map((c) => (
          <Redacted key={c} lines={9} seed={`${paper.id}${c}`} />
        ))}
      </div>
    </article>
  );
}
