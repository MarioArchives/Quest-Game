// The Story section's "Case notes": what the night has settled so far (the facts), as a ruled index card. Real data
// only: an empty fact reads "Unknown", and a fact nobody has settled yet is not listed.
import { EntryVideo } from '../../../components/EntryVideo';
import { PhotoThumb } from '../../../components/PhotoViewer';
import type { Doc, Fact } from '../../../shared';
import { IndexCard } from './CaseKit';

export function CaseNotes({ facts }: { facts: Doc<Fact>[] }) {
  if (facts.length === 0) return null;
  const ordered = [...facts].sort((a, b) => a.label.localeCompare(b.label));
  return (
    <li className="ms-notes">
      <IndexCard>
        <p className="ms-notes__h">Case notes</p>
        <dl className="ms-notes__list">
          {ordered.map((f) => (
            <div key={f.id} className="ms-notes__fact">
              <dt>{f.label}</dt>
              {f.value ? (
                <dd>{f.value}</dd>
              ) : f.entries.length === 0 ? (
                <dd className="ms-notes__unknown">Unknown</dd>
              ) : (
                f.entries.map((e) => (
                  <dd key={e.submissionId} className="ms-notes__entry">
                    {e.videoPath ? (
                      <EntryVideo videoPath={e.videoPath} thumbPath={e.thumbPath} label={`${e.displayName}'s video`} />
                    ) : e.thumbPath ? (
                      <PhotoThumb submissionId={e.submissionId} thumbPath={e.thumbPath} label={`Open ${e.displayName}'s photo`} size={56} />
                    ) : null}
                    <span>
                      {e.caption ? <q>{e.caption}</q> : null}
                      <small>Found by {e.displayName}</small>
                    </span>
                  </dd>
                ))
              )}
            </div>
          ))}
        </dl>
      </IndexCard>
    </li>
  );
}
