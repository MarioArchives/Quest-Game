// The eye and the heart on one side-quest entry: the counts (kept on the entry by the server), the signed-in player's
// own, and toggling them (submissions/{id}/entryReactions/{uid}). Optimistic, rolled back with a toast on failure.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { friendlyError } from '../api';
import { backend } from '../backend';
import { SERVER_TIME } from '../backend/types';
import { useToast } from '../components/Toast';
import { useSession } from '../session/SessionProvider';
import { canReact, ENTRY_REACTIONS, type Doc, type EntryReactionKind, type Submission } from '../shared';
import { useGame } from './GameProvider';

export interface EntryReactionsApi {
  count: Record<EntryReactionKind, number>;
  mine: Record<EntryReactionKind, boolean>;
  /** False on your own entry, for someone not playing, or on an entry not open to reactions (canReact). */
  can: boolean;
  toggle(kind: EntryReactionKind): void;
}

type Mine = Record<EntryReactionKind, boolean>;

export function useEntryReactions(entry: Doc<Submission>): EntryReactionsApi {
  const toast = useToast();
  const { user } = useSession();
  const { me } = useGame();
  const uid = user?.uid ?? null;
  const [pending, setPending] = useState<Partial<Mine>>({});

  const shown = useMemo<Mine>(() => {
    const has = (kind: EntryReactionKind) => Boolean(uid) && Boolean(entry.entryReactions?.[kind]?.includes(uid as string));
    return { eye: has('eye'), heart: has('heart') };
  }, [entry.entryReactions, uid]);

  // A pending toggle is dropped once the entry's lists show it.
  useEffect(() => {
    setPending((prev) => {
      let next: Partial<Mine> | null = null;
      for (const kind of ENTRY_REACTIONS) {
        if (prev[kind] !== undefined && prev[kind] === shown[kind]) {
          next ??= { ...prev };
          delete next[kind];
        }
      }
      return next ?? prev;
    });
  }, [shown]);

  const mine = useMemo<Mine>(() => ({ eye: pending.eye ?? shown.eye, heart: pending.heart ?? shown.heart }), [pending, shown]);
  const latest = useRef(mine);
  latest.current = mine;

  const count = useMemo(() => {
    const n = (kind: EntryReactionKind) => {
      const list = entry.entryReactions?.[kind] ?? [];
      const others = uid ? list.filter((u) => u !== uid).length : list.length;
      return others + (mine[kind] ? 1 : 0);
    };
    return { eye: n('eye'), heart: n('heart') };
  }, [entry.entryReactions, uid, mine]);

  const can = canReact(entry, uid) && Boolean(me) && !me?.left;

  const toggle = useCallback(
    (kind: EntryReactionKind) => {
      if (!uid || !can) return;
      const next: Mine = { ...latest.current, [kind]: !latest.current[kind] };
      latest.current = next;
      setPending((p) => ({ ...p, [kind]: next[kind] }));
      backend()
        .data.set(`submissions/${entry.id}/entryReactions/${uid}`, { eye: next.eye, heart: next.heart, updatedAt: SERVER_TIME })
        .catch((err: unknown) => {
          setPending((p) => {
            const rest = { ...p };
            delete rest[kind];
            return rest;
          });
          toast(friendlyError(err), 'error');
        });
    },
    [uid, can, entry.id, toast],
  );

  return { count, mine, can, toggle };
}
