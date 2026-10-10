import { useMemo, useState } from 'react';
import { rerollQuest } from '../../api';
import { AshtonLoader } from '../../components/AshtonLoader';
import { Button } from '../../components/Button';
import { ChangeWitnessSheet } from '../../components/ChangeWitnessSheet';
import { ClaimSheet } from '../../components/ClaimSheet';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs } from '../../data/hooks';
import type { Doc, Quest } from '../../shared';

/** The secret hand: tap a quest to claim it with a witness; pending ones wait for the witness. */
export function Hand({ quests, loading, rerollsLeft }: { quests: Doc<Quest>[]; loading: boolean; rerollsLeft: number }) {
  const toast = useToast();
  const { settings, state, mySubmissions, playersById } = useGame();
  const [claiming, setClaiming] = useState<Doc<Quest> | null>(null);
  const [rerolling, setRerolling] = useState<Doc<Quest> | null>(null);
  const [repicking, setRepicking] = useState<string | null>(null);

  const open = useMemo(
    () =>
      quests
        .filter((q) => q.status === 'active' || q.status === 'submitted')
        .sort((a, b) => tsMs(a.assignedAt) - tsMs(b.assignedAt) || a.title.localeCompare(b.title)),
    [quests],
  );
  // Completed quests stay in the list (they are not refilled), after the ones still to do.
  const done = useMemo(
    () => quests.filter((q) => q.status === 'done').sort((a, b) => tsMs(a.completedAt) - tsMs(b.completedAt)),
    [quests],
  );
  const hand = [...open, ...done];
  const slots = Math.max(settings.starterQuestCount, hand.length);
  const gameActive = state.status === 'active';
  const repick = repicking ? mySubmissions.find((s) => s.id === repicking && s.status === 'pending') : undefined;

  return (
    <section aria-labelledby="hand-title" className="acct-section">
      <div className="section-head">
        <h2 id="hand-title">Your quests</h2>
        <span className="section-head__meta">
          {done.length} of {slots} quests done
        </span>
      </div>
      <p className="hand__rule">
        <Icon name="lock" size={14} strokeWidth={2.6} />
        <span>
          Only you can see these.{' '}
          {settings.refillOnComplete
            ? 'A fresh quest arrives each time you complete one.'
            : `You get ${settings.starterQuestCount} quests for the whole game. A new one only arrives when a claim is rejected, someone guesses one of yours, or you reroll.`}
        </span>
      </p>

      {!gameActive ? (
        <p className="note" role="status">
          {state.status === 'lobby'
            ? "The game hasn't started yet. You can look at your hand, but claims open when the GM starts."
            : state.status === 'paused'
              ? 'The game is paused. Claims open again when the GM resumes.'
              : 'The game has ended. No more claims.'}
        </p>
      ) : null}

      {loading ? (
        <AshtonLoader className="app__loader" caption="Dealing" />
      ) : hand.length === 0 ? (
        <div className="empty">
          <h3>No quests in hand</h3>
          <p>
            {state.status === 'lobby'
              ? 'Your hand is dealt when you are approved. If it is empty, ask the GM.'
              : 'Nothing active right now. A new quest arrives after a rejection, an exposure or a reroll.'}
          </p>
        </div>
      ) : (
        <ol className="hand" aria-label="Your quests">
          {hand.map((quest, index) => {
            if (quest.status === 'done') {
              return (
                <li key={quest.id} className="qcard qcard--done">
                  <div className="qcard__top">
                    <span className="qcard__num" aria-hidden="true">
                      <Icon name="check" size={18} strokeWidth={3} />
                    </span>
                    <div className="qcard__text">
                      <h3 className="qcard__title">{quest.title}</h3>
                      {quest.description ? <p className="qcard__desc">{quest.description}</p> : null}
                    </div>
                  </div>
                  <div className="qcard__bottom">
                    <span className="qcard__state">Done</span>
                  </div>
                </li>
              );
            }
            const submitted = quest.status === 'submitted';
            const pending = submitted ? mySubmissions.find((s) => s.kind === 'personal' && s.questId === quest.id && s.status === 'pending') : undefined;
            const witness = pending ? playersById.get(pending.witnessUid) : undefined;
            return (
              <li key={quest.id} className={`qcard${submitted ? ' qcard--submitted' : ''}`}>
                <div className="qcard__top">
                  <span className="qcard__num" aria-hidden="true">
                    {index + 1}
                  </span>
                  {submitted ? (
                    <div className="qcard__text">
                      <h3 className="qcard__title">{quest.title}</h3>
                      {quest.description ? <p className="qcard__desc">{quest.description}</p> : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="qcard__main"
                      disabled={!gameActive}
                      aria-label={`Claim: ${quest.title}`}
                      onClick={() => setClaiming(quest)}
                    >
                      <span className="qcard__title">{quest.title}</span>
                      {quest.description ? <span className="qcard__desc">{quest.description}</span> : null}
                    </button>
                  )}
                </div>
                <div className="qcard__bottom">
                  {submitted ? (
                    <>
                      <span className="qcard__state">Waiting for {witness?.displayName ?? 'your witness'}</span>
                      {pending ? (
                        <button type="button" className="linkbtn" onClick={() => setRepicking(pending.id)}>
                          Ask someone else
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="qcard__state">Active &middot; +{settings.questPoints}</span>
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={`Reroll quest ${index + 1}: ${quest.title}`}
                        disabled={rerollsLeft <= 0 || state.status === 'ended'}
                        title={rerollsLeft <= 0 ? 'No rerolls left' : 'Reroll this quest'}
                        onClick={() => setRerolling(quest)}
                      >
                        <Icon name="refresh" size={20} strokeWidth={2.4} />
                      </button>
                      <Button
                        variant="primary"
                        small
                        className="qcard__submit"
                        icon={<Icon name="send" size={16} strokeWidth={2.2} />}
                        disabled={!gameActive}
                        onClick={() => setClaiming(quest)}
                      >
                        Claim
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!loading && open.length === 0 && done.length > 0 && !settings.refillOnComplete ? (
        <p className="note" role="status">
          Every quest is done. A new one only arrives if a claim is rejected or someone guesses one of yours.
        </p>
      ) : null}

      {claiming ? <ClaimSheet quest={claiming} onClose={() => setClaiming(null)} /> : null}
      {repick ? <ChangeWitnessSheet submission={repick} onClose={() => setRepicking(null)} /> : null}
      {rerolling ? (
        <ConfirmSheet
          title="Swap this quest?"
          confirmLabel="Reroll it"
          onClose={() => setRerolling(null)}
          onConfirm={async () => {
            await rerollQuest({ questId: rerolling.id });
            toast('Fresh quest dealt.', 'success');
          }}
        >
          <p>
            <strong>&ldquo;{rerolling.title}&rdquo;</strong> goes back in the deck and you get a different one at random.
          </p>
          <p className="muted">
            This uses one reroll. You have {rerollsLeft} left, {Math.max(0, rerollsLeft - 1)} after this.
          </p>
        </ConfirmSheet>
      ) : null}
    </section>
  );
}
