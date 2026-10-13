import { backend } from '../../backend';
import { SERVER_TIME } from '../../backend/types';
import { firstHidden, moveStop, type RouteStop } from './stops';

/** Reveals a stop to the players and posts "New location: <name>" to the feed (which pushes it). */
export async function revealStop(stop: RouteStop, gmUid: string): Promise<void> {
  await backend().data.update(`stops/${stop.id}`, { revealed: true });
  await backend().data.add('feed', {
    type: 'stop-revealed',
    text: `New location: ${stop.name}`,
    uid: null,
    ref: stop.id,
    actorUid: gmUid,
    createdAt: SERVER_TIME,
  });
}

/** Hides a stop from the players again (the feed post stays; it only said the place was announced). */
export async function hideStop(stop: RouteStop): Promise<void> {
  await backend().data.update(`stops/${stop.id}`, { revealed: false });
}

/** Reveals the first hidden stop in route order; returns it, or null when everything is already revealed. */
export async function revealNext(stops: RouteStop[], gmUid: string): Promise<RouteStop | null> {
  const next = firstHidden(stops);
  if (next) await revealStop(next, gmUid);
  return next;
}

/** Moves a stop one place up (-1) or down (1), renumbering the route. */
export async function moveStopBy(stops: RouteStop[], id: string, direction: -1 | 1): Promise<void> {
  const changes = moveStop(stops, id, direction);
  if (changes.length === 0) return;
  await backend().data.batch(changes.map((c) => ({ op: 'update', path: `stops/${c.id}`, data: { order: c.order } })));
}
