import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { EvidenceSheet, type EvidenceTarget } from '../../components/EvidenceSheet';
import { Icon } from '../../components/Icon';
import { useGame } from '../../data/GameProvider';
import { useSession } from '../../session/SessionProvider';

const skipKey = (uid: string, id: string) => `fq:skip-evidence:${uid}:${id}`;

function skipped(uid: string, id: string): boolean {
  try {
    return localStorage.getItem(skipKey(uid, id)) === '1';
  } catch {
    return false;
  }
}

/** "Approved! +100. Add a photo or a comment": one banner per approved personal claim that has neither yet. */
export function AddEvidenceBanners({ titleById }: { titleById: Map<string, string> }) {
  const { user } = useSession();
  const { mySubmissions, state } = useGame();
  const uid = user?.uid ?? '';
  const [sheet, setSheet] = useState<EvidenceTarget | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const waiting = useMemo(
    () =>
      mySubmissions.filter(
        (s) => s.kind === 'personal' && s.status === 'approved' && !s.imagePath && !s.caption && !hidden.has(s.id) && !skipped(uid, s.id),
      ),
    [mySubmissions, hidden, uid],
  );
  if (state.status === 'ended' || waiting.length === 0) return null;

  const skip = (id: string) => {
    try {
      localStorage.setItem(skipKey(uid, id), '1');
    } catch {
      /* hidden for this visit only */
    }
    setHidden((prev) => new Set(prev).add(id));
  };

  return (
    <>
      <section aria-label="Add to your posts" className="acct-section">
        <ul className="evbanners">
          {waiting.map((s) => {
            const title = s.questTitle ?? titleById.get(s.questId) ?? 'your quest';
            return (
              <li key={s.id} className="evbanner">
                <Icon name="camera" size={24} strokeWidth={2.2} />
                <div className="evbanner__text">
                  <p className="evbanner__title">Approved! +{s.pointsAwarded ?? 0}</p>
                  <p className="evbanner__sub">
                    {title}. Add a photo or a comment to your post.
                  </p>
                </div>
                <div className="evbanner__actions">
                  <Button variant="primary" className="evbanner__add" onClick={() => setSheet({ mode: 'evidence', submission: s, title })}>
                    Add photo or comment
                  </Button>
                  <button type="button" className="evbanner__skip" onClick={() => skip(s.id)}>
                    Not now
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {sheet ? <EvidenceSheet target={sheet} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
