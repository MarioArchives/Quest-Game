import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import look from '@pack';
import { friendlyError, resolveReward } from '../api';
import { useGame } from '../data/GameProvider';
import { frameTargets, pendingReward } from '../lib/rewards';
import { features, t } from '../pack';
import type { Doc, Player, Reward } from '../shared';
import { Avatar } from './Avatar';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { useToast } from './Toast';
import './RewardSheet.css';

interface RewardSheetApi {
  /** The player's oldest pending reward, or null. */
  pending: Doc<Reward> | null;
  /** Opens the pop-up for it (also after it was closed this session). */
  open(): void;
}

const NONE: RewardSheetApi = { pending: null, open: () => {} };
const RewardSheetContext = createContext<RewardSheetApi>(NONE);

/** The pending reward and a way to open its pop-up, for screens that prompt "use your reward". */
export function useRewardSheet(): RewardSheetApi {
  return useContext(RewardSheetContext);
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * Shows the reward choice over any screen while a reward is pending. Closing leaves the reward pending: the pop-up
 * stays shut until the next session, a newer reward, or `open()`.
 */
export function RewardSheetProvider({ children }: { children: ReactNode }) {
  const { myRewards } = useGame();
  const pending = features.rewardChoice ? pendingReward(myRewards) : null;
  // The reward the player closed the pop-up on this session.
  const [closedId, setClosedId] = useState<string | null>(null);
  const open = useCallback(() => setClosedId(null), []);
  const api = useMemo(() => ({ pending, open }), [pending, open]);

  return (
    <RewardSheetContext.Provider value={api}>
      {children}
      {pending && pending.id !== closedId ? <RewardChoice key={pending.id} reward={pending} onClose={() => setClosedId(pending.id)} /> : null}
    </RewardSheetContext.Provider>
  );
}

function RewardChoice({ reward, onClose }: { reward: Doc<Reward>; onClose(): void }) {
  const toast = useToast();
  const { settings, activePlayers, me } = useGame();
  const copy = look.reward;
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const targets = frameTargets(activePlayers, me?.id ?? '');

  const resolve = async (choice: 'clean' | 'frame', target?: Doc<Player>) => {
    setBusy(true);
    try {
      const { points } = await resolveReward({ rewardId: reward.id, choice, targetUid: target?.id });
      const amount = Math.abs(points);
      toast(choice === 'clean' ? `+${amount} to you` : `${firstName(target?.displayName ?? 'They')} −${amount}`, 'success');
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
      setBusy(false);
    }
  };

  return (
    <BottomSheet title={picking ? (copy?.pickTitle ?? 'Pick a player') : (copy?.title ?? `${t.quest.One} done`)} onClose={onClose} locked={busy}>
      <div className="reward-sheet">
        {picking ? (
          <>
            <button type="button" className="reward-sheet__back" disabled={busy} onClick={() => setPicking(false)}>
              <Icon name="chevronDown" size={18} strokeWidth={2.4} className="reward-sheet__back-icon" />
              Back
            </button>
            {targets.length === 0 ? (
              <p className="muted">There is nobody else to pick.</p>
            ) : (
              <ul className="reward-grid">
                {targets.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="reward-target" disabled={busy} onClick={() => void resolve('frame', p)}>
                      <Avatar name={p.displayName} src={p.photoURL} size={52} uid={p.id} />
                      <span className="reward-target__name">{firstName(p.displayName)}</span>
                      <span className="reward-target__score">{p.points ?? 0}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="reward-sheet__choices">
            <button type="button" className="reward-disc reward-disc--clean" disabled={busy} onClick={() => void resolve('clean')}>
              <span className="reward-disc__label">{copy?.clean ?? 'Points for you'}</span>
              <span className="reward-disc__points">+{settings.cleanPoints}</span>
            </button>
            <button type="button" className="reward-disc reward-disc--frame" disabled={busy} onClick={() => setPicking(true)}>
              <span className="reward-disc__label">{copy?.frame ?? 'Points off someone'}</span>
              <span className="reward-disc__points">&minus;{settings.framePoints}</span>
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
