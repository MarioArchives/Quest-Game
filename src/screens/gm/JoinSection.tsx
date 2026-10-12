import { reviewJoinRequest } from '../../api';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { tsMs, useNow } from '../../data/hooks';
import { formatAgo } from '../../lib/time';
import { t } from '../../pack';
import type { Doc, JoinRequest } from '../../shared';
import { useGmData } from './GmData';
import { useRunner } from './common';

export function JoinSection() {
  const { pendingJoins, rejectedJoins, loading, error } = useGmData();
  const { busyKey, run } = useRunner();
  const now = useNow(30_000);

  const review = (req: Doc<JoinRequest>, approve: boolean) =>
    void run(
      `${approve ? 'yes' : 'no'}:${req.id}`,
      () => reviewJoinRequest({ uid: req.id, approve }),
      approve ? `${req.displayName} is in. Their ${t.quest.many} are dealt.` : `${req.displayName} turned away.`,
    );

  return (
    <>
      <div className="section-head">
        <h2>Join requests</h2>
        <span className="section-head__meta">{pendingJoins.length} waiting</span>
      </div>

      {error ? (
        <p className="note note--error" role="alert">
          Couldn&apos;t load join requests.
        </p>
      ) : loading ? null : pendingJoins.length === 0 ? (
        <div className="empty">
          <h3>Nobody waiting</h3>
          <p>New requests show up here the moment someone signs in and asks to join. {t.gm.Many} need no approval: they join the moment they ask.</p>
        </div>
      ) : (
        <ul className="gm-list">
          {pendingJoins.map((req) => (
            <li key={req.id} className="gm-row-item">
              <div className="gm-person">
                <Avatar name={req.displayName} src={req.photoURL} size={44} />
                <p className="gm-person__text">
                  <strong>{req.displayName}</strong>
                  <span className="gm-person__sub">{req.email ?? 'No email'}</span>
                  <span className="gm-person__sub">asked {formatAgo(tsMs(req.createdAt), now)}</span>
                </p>
              </div>
              <div className="gm-row">
                <Button
                  variant="primary"
                  className="gm-flex2"
                  busy={busyKey === `yes:${req.id}`}
                  disabled={busyKey !== null}
                  onClick={() => review(req, true)}
                >
                  Approve
                </Button>
                <Button className="gm-flex1" busy={busyKey === `no:${req.id}`} disabled={busyKey !== null} onClick={() => review(req, false)}>
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rejectedJoins.length > 0 ? (
        <details className="gm-fold">
          <summary>
            <span>Turned away · {rejectedJoins.length}</span>
          </summary>
          <ul className="gm-list">
            {rejectedJoins.map((req) => (
              <li key={req.id} className="gm-row-item gm-row-item--inline">
                <div className="gm-person">
                  <Avatar name={req.displayName} src={req.photoURL} size={36} />
                  <p className="gm-person__text">
                    <strong>{req.displayName}</strong>
                    <span className="gm-person__sub">{req.email ?? 'No email'}</span>
                  </p>
                </div>
                <Button
                  small
                  busy={busyKey === `yes:${req.id}`}
                  disabled={busyKey !== null}
                  onClick={() => review(req, true)}
                >
                  Let them in
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
