// The demo game, as plain data: four players with hands, claims, reactions, a feed and (when the pack has them)
// a live side quest and map pins, plus a newcomer who has only just been let in. The seed script writes it to Firestore; the mock backend loads it into memory.
// Pure and deterministic: same pack, settings and nowMs give the same output. No Node APIs, no clock, no Math.random.
import type { CatalogueQuest, GamePack } from '../packs/types.ts';
import { termForms } from '../packs/terms.ts';
import { takesVote } from '../feedVotes.ts';
import { routeSeedStops } from '../route.ts';
import { Stamp } from '../store/stamp.ts';
import type { DocData } from '../store/types.ts';
import type { Settings } from '../types.ts';
import { voteStyleOf } from '../votes.ts';
import { BOTS, hashString, particularsFor, mulberry32, NEWCOMER, REACTIONS, shuffled, VOTES, type Bot } from './bots.ts';
import { posterSvg } from './poster.ts';

export interface DemoFile {
  path: string;
  contentType: string;
  /** The file's text (demo posters are SVG)… */
  text?: string;
  /** …or a demo clip or its still, by file name in demo/clips/ (the mock serves it from there; the seed uploads it). */
  clip?: string;
}

export interface DemoGame {
  /** Documents to write, by path (only ones that don't exist yet should be written). */
  docs: Array<{ path: string; data: DocData }>;
  /** Files to store (demo photo posters, and the video entries' clips and stills). */
  files: DemoFile[];
  /** The demo players' uids, display names first. */
  players: Array<{ uid: string; displayName: string }>;
}

export interface DemoOptions {
  pack: GamePack;
  settings: Settings;
  /** "Now" in epoch ms; every time in the demo is relative to it. */
  nowMs: number;
}

export const DEMO_SIDE_QUEST = 'demo-side';
const SIDE_QUEST = DEMO_SIDE_QUEST;
/** A story mission that takes a video, when the pack has one: shown with its vote open. */
export const DEMO_VIDEO_QUEST = 'demo-video';
/** How long the demo's video vote stays open, in minutes. */
const DEMO_VOTE_MIN = 180;
const SVG = 'image/svg+xml';

/** The video entries: who sent which clip (demo/clips/<clip>.mp4 and .jpg), with what caption. */
const VIDEO_ENTRIES: Array<{ bot: number; clip: string; caption: string; minutesAgo: number }> = [
  { bot: 0, clip: 'toast', caption: 'Half the party raised a glass with me at 11:02.', minutesAgo: 52 },
  { bot: 1, clip: 'pour', caption: 'The barman was pouring my pint. Ask him.', minutesAgo: 41 },
  { bot: 2, clip: 'karaoke', caption: 'Mid-chorus at 11:02. Fifty witnesses.', minutesAgo: 30 },
  { bot: 3, clip: 'served', caption: 'She served me at the bar at 11:02 on the dot.', minutesAgo: 19 },
];

/** The demo's first stops are revealed and timed (minutes from "now"); later route stops stay hidden with no times. */
const DEMO_ROUTE_TIMES: Array<{ startsMin: number; endsMin?: number }> = [
  { startsMin: -60, endsMin: -5 },
  { startsMin: 0 },
  { startsMin: 60 },
];

export function buildDemo({ pack, settings, nowMs }: DemoOptions): DemoGame {
  const T = termForms(pack.terms);
  const { personal, global: sideQuests } = pack.catalogue;
  const questPoints = settings.questPoints;
  const rejectPenalty = settings.rejectPenalty;
  // With the reward choice, each player has already used every confirmed quest's reward to clean (destroy the
  // evidence), so a pack whose quests pay only through the reward (questPoints 0) still has a night of scores.
  const rewards = pack.features.rewardChoice;
  const cleanPoints = settings.cleanPoints;
  const usedRewards = (bot: Bot) => (rewards ? bot.done.length : 0);
  const sidePoints = settings.sideQuestPoints;
  const windowMin = settings.globalWindowMin;
  const handSize = settings.starterQuestCount;
  const at = (minutesAgo: number): Stamp => Stamp.fromMillis(nowMs - minutesAgo * 60_000);

  const entries: Array<[string, DocData]> = [];
  const files: DemoFile[] = [];
  const postIds = new Set<string>();
  let timeline = 200; // minutes ago; each event is a bit more recent than the last

  // Witnesses are always other bots: bot i is vouched for by bot i+1, i+2, ... in turn (never itself).
  const witnessFor = (botIndex: number, n: number) => BOTS[(botIndex + 1 + ((n - 1) % (BOTS.length - 1))) % BOTS.length];
  const claimOf = (t: CatalogueQuest, witnessUid: string) => ({ witnessUid, claimTitle: t.title, claimDescription: t.description });
  const pushPhoto = (path: string, thumbPath: string, title: string, who: string) => {
    files.push({ path, contentType: SVG, text: posterSvg({ title, who, width: 1200, height: 900, name: pack.name }) });
    files.push({ path: thumbPath, contentType: SVG, text: posterSvg({ title, who, width: 400, height: 300, name: pack.name }) });
  };

  /** Posts that gathered votes (packs with vote reactions), for game/top. */
  const voted: Array<{ id: string; score: number; up: number; down: number; at: number; last: number }> = [];

  /** Feed post, with its reactions or votes (reactionCount and the vote counts are kept in step with them). */
  const pushPost = (id: string, createdAt: Stamp, fields: DocData) => {
    postIds.add(id);
    if (pack.reactions === 'votes') {
      const cast = (VOTES[id] ?? []).filter(([uid]) => takesVote({ type: fields.type, uid: fields.uid, actorUid: fields.actorUid }, uid));
      const votes = Object.fromEntries(cast);
      const up = cast.filter(([, v]) => v === 1).length;
      const down = cast.length - up;
      const counts = cast.length ? { up, down, score: up - down, votes } : {};
      entries.push([`feed/${id}`, { ...fields, createdAt, reactionCount: cast.length, ...counts }]);
      cast.forEach(([uid, vote], i) => {
        entries.push([`feed/${id}/reactions/${uid}`, { vote, createdAt: Stamp.fromMillis(createdAt.toMillis() + (i + 1) * 90_000) }]);
      });
      if (cast.length) voted.push({ id, score: up - down, up, down, at: createdAt.toMillis(), last: createdAt.toMillis() + cast.length * 90_000 });
      return;
    }
    const reactions = REACTIONS[id] ?? [];
    entries.push([`feed/${id}`, { ...fields, createdAt, reactionCount: reactions.length }]);
    reactions.forEach(([uid, emoji]: [string, string], i: number) => {
      entries.push([`feed/${id}/reactions/${uid}`, { emoji, createdAt: Stamp.fromMillis(createdAt.toMillis() + (i + 1) * 90_000) }]);
    });
  };

  for (const [botIndex, bot] of BOTS.entries()) {
    const rng = mulberry32(hashString(bot.uid));
    const deck = shuffled(personal, rng);
    const needed = handSize + bot.done.length + bot.rerolls + (bot.rejected ? 1 : 0);
    if (deck.length < needed) throw new Error(`Not enough personal ${T.quest.many} in the ${pack.id} catalogue for ${bot.name}`);
    const take = (n: number) => deck.splice(0, n);

    const live = take(handSize); // the current hand: q1.. (a fresh quest is dealt whenever one is completed or rejected)
    const done = take(bot.done.length);
    const replaced = take(bot.rerolls);
    const rejectedQuest = bot.rejected ? take(1)[0] : undefined;

    const questData = (t: CatalogueQuest, status: string, minutesAgo: number, extra: DocData = {}) => ({
      templateId: t.id,
      title: t.title,
      description: t.description,
      status,
      assignedAt: at(minutesAgo),
      submissionId: null,
      completedAt: null,
      exposedBy: null,
      exposedAt: null,
      ...extra,
    });
    const character = pack.features.characters ? pack.demoCharacters?.[botIndex] : undefined;
    const questRef = (id: string) => `players/${bot.uid}/quests/${id}`;
    const pending = bot.submitted ? `${bot.uid}-pending` : null;
    const rejectedId = bot.rejected ? `${bot.uid}-rejected` : null;

    entries.push([
      `players/${bot.uid}`,
      {
        displayName: bot.name,
        photoURL: null,
        joinedAt: at(240),
        points: questPoints * bot.done.length + cleanPoints * usedRewards(bot) - (bot.rejected ? rejectPenalty : 0),
        rerollsUsed: bot.rerolls,
        questsCompleted: bot.done.length,
        bookedAt: at(238),
        particulars: particularsFor(bot, pack.booking?.relations),
        ...(character ? { character: { name: character.name, role: character.role } } : {}),
      },
    ]);
    // The motive is private, so it lives apart from the public player doc.
    if (character) entries.push([`motives/${bot.uid}`, { text: character.motive, updatedAt: at(240) }]);
    pushPost(`join-${bot.uid}`, at(240), { type: 'join', text: `${bot.name} joined the game`, uid: bot.uid, ref: null });

    // Live hand: mostly active; the last quest is "submitted" while its claim waits for the witness.
    live.forEach((t: CatalogueQuest, i: number) => {
      const isSubmitted = pending && i === live.length - 1;
      entries.push([
        questRef(`q${i + 1}`),
        questData(t, isSubmitted ? 'submitted' : 'active', 230 - i * 5, { submissionId: isSubmitted ? pending : null }),
      ]);
    });
    replaced.forEach((t: CatalogueQuest, i: number) => entries.push([questRef(`rr${i + 1}`), questData(t, 'replaced', 235 - i * 5)]));

    // Completed quests: claimed with no photo, approved by a bot witness, evidence added afterwards.
    done.forEach((t: CatalogueQuest, i: number) => {
      const n = i + 1;
      const d = bot.done[i];
      const subId = `${bot.uid}-${n}`;
      const minutesAgo = (timeline -= 11);
      const witness = witnessFor(botIndex, n);
      const withPhoto = d.evidence === 'photo';
      const imagePath = withPhoto ? `submissions/${bot.uid}/${subId}.jpg` : null;
      const thumbPath = withPhoto ? `submissions/${bot.uid}/${subId}_thumb.jpg` : null;
      const caption = d.evidence ? d.caption : null;
      const postId = `approved-${subId}`;

      entries.push([questRef(`done${n}`), questData(t, 'done', 235 - i * 5, { submissionId: subId, completedAt: at(minutesAgo - 3) })]);
      entries.push([
        `submissions/${subId}`,
        {
          uid: bot.uid,
          kind: 'personal',
          questId: `done${n}`,
          ...claimOf(t, witness.uid),
          createdAt: at(minutesAgo + 4),
          status: 'approved',
          imagePath,
          thumbPath,
          caption,
          evidenceAt: d.evidence ? at(minutesAgo - 3) : null,
          feedId: postId,
          processedAt: at(minutesAgo + 4),
          pointsAwarded: questPoints,
          reviewedBy: witness.uid,
          reviewedAt: at(minutesAgo),
          reviewNote: d.note,
          rejectReason: null,
          questTitle: t.title,
          refillQuestId: `q${n}`,
        },
      ]);
      // As the game does, a quest that pays nothing by itself (only through its reward) has no ledger line.
      if (questPoints !== 0) {
        entries.push([
          `pointsLedger/ledger-${subId}`,
          { uid: bot.uid, delta: questPoints, reason: 'quest', ref: subId, by: witness.uid, note: d.note, createdAt: at(minutesAgo) },
        ]);
      }
      if (rewards && i < usedRewards(bot)) {
        entries.push([
          `rewards/${subId}`,
          { uid: bot.uid, submissionId: subId, status: 'cleaned', createdAt: at(minutesAgo), resolvedAt: at(minutesAgo - 2), targetUid: null, applied: cleanPoints },
        ]);
        if (cleanPoints !== 0) {
          entries.push([
            `pointsLedger/ledger-${subId}-cleared`,
            { uid: bot.uid, delta: cleanPoints, reason: 'cleared', ref: subId, by: 'system', createdAt: at(minutesAgo - 2) },
          ]);
        }
      } else if (rewards) {
        entries.push([`rewards/${subId}`, { uid: bot.uid, submissionId: subId, status: 'pending', createdAt: at(minutesAgo) }]);
      }
      pushPost(postId, at(minutesAgo), {
        type: 'approved',
        text: `${bot.name} completed "${t.title}" — witnessed by ${witness.name}`,
        uid: bot.uid,
        ref: subId,
        photoURL: null,
        points: questPoints,
        actorUid: witness.uid,
        note: d.note,
        questTitle: t.title,
        submissionId: subId,
        imagePath,
        thumbPath,
        caption,
      });
      if (imagePath && thumbPath) pushPhoto(imagePath, thumbPath, t.title, bot.name);
    });

    // A claim its witness turned down: -rejectPenalty, the quest swapped for a fresh one (no reroll cost).
    if (bot.rejected) {
      const t = rejectedQuest!;
      const witness = BOTS.find((x) => x.uid === bot.rejected!.witness)!;
      const minutesAgo = (timeline -= 11);
      const postId = `rejected-${rejectedId}`;
      entries.push([questRef('rej1'), questData(t, 'replaced', 220, { submissionId: rejectedId })]);
      entries.push([
        `submissions/${rejectedId}`,
        {
          uid: bot.uid,
          kind: 'personal',
          questId: 'rej1',
          ...claimOf(t, witness.uid),
          createdAt: at(minutesAgo + 3),
          status: 'rejected',
          imagePath: null,
          thumbPath: null,
          caption: null,
          feedId: postId,
          processedAt: at(minutesAgo + 3),
          pointsAwarded: 0,
          reviewedBy: witness.uid,
          reviewedAt: at(minutesAgo),
          reviewNote: bot.rejected.note,
          rejectReason: null,
        },
      ]);
      entries.push([
        `pointsLedger/ledger-${rejectedId}`,
        { uid: bot.uid, delta: -rejectPenalty, reason: 'rejected', ref: rejectedId, by: witness.uid, note: bot.rejected.note, createdAt: at(minutesAgo) },
      ]);
      pushPost(postId, at(minutesAgo), {
        type: 'rejected',
        text: `${witness.name} rejected ${bot.name}'s ${T.claim.one} "${t.title}"`,
        uid: bot.uid,
        ref: rejectedId,
        photoURL: null,
        points: -rejectPenalty,
        actorUid: witness.uid,
        note: bot.rejected.note,
        questTitle: t.title,
        submissionId: rejectedId,
      });
    }

    // One bot has a claim waiting for its witness (processedAt is set so the functions trigger leaves it alone).
    if (bot.submitted) {
      const t = live[live.length - 1];
      entries.push([
        `submissions/${pending}`,
        {
          uid: bot.uid,
          kind: 'personal',
          questId: `q${live.length}`,
          ...claimOf(t, bot.submitted.witness),
          createdAt: at(6),
          status: 'pending',
          processedAt: at(6),
        },
      ]);
    }

  }

  // The newcomer: let in a few minutes ago with a fresh hand, nothing done, and the pack's onboarding still to do.
  {
    const deck = shuffled(personal, mulberry32(hashString(NEWCOMER.uid)));
    if (deck.length < handSize) throw new Error(`Not enough personal ${T.quest.many} in the ${pack.id} catalogue for ${NEWCOMER.name}`);
    entries.push([
      `players/${NEWCOMER.uid}`,
      { displayName: NEWCOMER.name, photoURL: null, joinedAt: at(4), points: 0, rerollsUsed: 0, questsCompleted: 0, bookedAt: null },
    ]);
    deck.slice(0, handSize).forEach((t: CatalogueQuest, i: number) => {
      entries.push([
        `players/${NEWCOMER.uid}/quests/q${i + 1}`,
        { templateId: t.id, title: t.title, description: t.description, status: 'active', assignedAt: at(4), submissionId: null, completedAt: null, exposedBy: null, exposedAt: null },
      ]);
    });
    pushPost(`join-${NEWCOMER.uid}`, at(4), { type: 'join', text: `${NEWCOMER.name} joined the game`, uid: NEWCOMER.uid, ref: null });
  }

  // A live side quest with two entries (no witness: everyone votes once voting opens). Only when the pack has them.
  if (pack.features.sideQuests && sideQuests.length > 0) {
    const template = sideQuests.find((q) => q.id === 'g-album-cover') ?? sideQuests[0];
    const side = {
      title: template.title,
      description: template.description,
      bonusPoints: sidePoints,
      source: 'gm-random',
      templateId: template.id,
      startsAt: at(5),
      endsAt: Stamp.fromMillis(nowMs - 5 * 60_000 + windowMin * 60_000),
      status: 'live',
      votingEndsAt: null,
      winnerUids: [],
      winningSubmissionIds: [],
      tally: null,
    };
    entries.push([`globalQuests/${SIDE_QUEST}`, side]);
    pushPost('side-open', at(5), { type: 'global-open', text: `New ${T.sideQuest.one}: ${side.title}`, uid: null, ref: SIDE_QUEST });
    const sideEntrants = [
      { bot: BOTS[0], caption: 'Moody. Very moody.', minutesAgo: 4 },
      { bot: BOTS[1], caption: 'Sam on lead vocals, obviously.', minutesAgo: 2 },
    ];
    for (const { bot, caption, minutesAgo } of sideEntrants) {
      const subId = `${bot.uid}-side`;
      const imagePath = `submissions/${bot.uid}/${subId}.jpg`;
      const thumbPath = `submissions/${bot.uid}/${subId}_thumb.jpg`;
      const postId = `entry-${subId}`;
      entries.push([
        `submissions/${subId}`,
        {
          uid: bot.uid,
          kind: 'global',
          questId: SIDE_QUEST,
          createdAt: at(minutesAgo),
          // Sealed, as enterSideQuest makes them: hidden until the vote, so a GM can check them first.
          status: 'sealed',
          imagePath,
          thumbPath,
          caption,
          evidenceAt: at(minutesAgo),
          feedId: postId,
          processedAt: at(minutesAgo),
          pointsAwarded: 0,
          questTitle: side.title,
        },
      ]);
      pushPost(postId, at(minutesAgo), {
        type: 'approved',
        text: `${bot.name} entered the ${T.sideQuest.one} "${side.title}"`,
        uid: bot.uid,
        ref: subId,
        photoURL: null,
        questTitle: side.title,
        submissionId: subId,
      });
      pushPhoto(imagePath, thumbPath, side.title, bot.name);
    }
  }

  // A story mission that takes a video (a pack whose story has one), its vote open with the players' clips, so the demo
  // shows video entries: looping on the vote's polaroids, with a player in the feed.
  const videoStory = pack.features.sideQuests ? (pack.catalogue.story ?? []).find((q) => q.entry?.media === 'video' && q.kind !== 'announce') : undefined;
  if (videoStory) {
    entries.push([
      `globalQuests/${DEMO_VIDEO_QUEST}`,
      {
        title: videoStory.title,
        description: videoStory.description,
        bonusPoints: videoStory.points ?? sidePoints,
        source: 'story',
        templateId: null,
        startsAt: at(60),
        endsAt: at(10),
        status: 'voting',
        // Open for hours rather than the usual window, so the vote is still there after a slow look round the demo.
        votingEndsAt: Stamp.fromMillis(nowMs + Math.max(settings.voteWindowMin, DEMO_VOTE_MIN) * 60_000),
        voteStyle: voteStyleOf({ voteStyle: settings.voteStyle }),
        winnerUids: [],
        winningSubmissionIds: [],
        tally: null,
        storyId: videoStory.id,
        judging: videoStory.judging ?? 'vote',
        skipPenalty: videoStory.penalty ?? settings.sideQuestSkipPenalty,
        fastestBonus: videoStory.fastestBonus ?? 0,
        entry: videoStory.entry,
        ...(videoStory.votePoints != null ? { votePoints: videoStory.votePoints } : {}),
        ...(videoStory.tieBonus != null ? { tieBonus: videoStory.tieBonus } : {}),
        question: videoStory.question ?? null,
        gmChecks: false,
      },
    ]);
    pushPost('video-open', at(60), { type: 'global-open', text: `New ${T.sideQuest.one}: ${videoStory.title}`, uid: null, ref: DEMO_VIDEO_QUEST, questTitle: videoStory.title });
    for (const { bot: index, clip, caption, minutesAgo } of VIDEO_ENTRIES) {
      const bot = BOTS[index];
      const subId = `${bot.uid}-video`;
      const videoPath = `submissions/${bot.uid}/${subId}.mp4`;
      const thumbPath = `submissions/${bot.uid}/${subId}_thumb.jpg`;
      const postId = `entry-${subId}`;
      const media = { imagePath: null, thumbPath, videoPath, caption };
      // Revealed, as the vote opening made them: votable, with the clip on the entry's post.
      entries.push([
        `submissions/${subId}`,
        { uid: bot.uid, kind: 'global', questId: DEMO_VIDEO_QUEST, createdAt: at(minutesAgo), status: 'approved', ...media, evidenceAt: at(minutesAgo), feedId: postId, processedAt: at(minutesAgo), pointsAwarded: 0, questTitle: videoStory.title },
      ]);
      pushPost(postId, at(minutesAgo), {
        type: 'approved',
        text: `${bot.name} entered the ${T.sideQuest.one} "${videoStory.title}"`,
        uid: bot.uid,
        ref: subId,
        photoURL: null,
        questTitle: videoStory.title,
        submissionId: subId,
        ...media,
      });
      files.push({ path: videoPath, contentType: 'video/mp4', clip: `${clip}.mp4` });
      files.push({ path: thumbPath, contentType: 'image/jpeg', clip: `${clip}.jpg` });
    }
    pushPost('video-voting', at(10), { type: 'voting-open', text: `Voting is open: ${videoStory.title}`, uid: null, ref: DEMO_VIDEO_QUEST, questTitle: videoStory.title });
  }

  // Reactions only make sense on posts that exist; a typo in REACTIONS would silently drop them, so say so.
  for (const id of Object.keys(REACTIONS)) if (!postIds.has(id) && !(id.startsWith('entry-') && !pack.features.sideQuests)) throw new Error(`REACTIONS refers to a post that is not seeded: ${id}`);

  // Reactions only make sense on posts that exist; a typo in REACTIONS would silently drop them, so say so.
  for (const id of Object.keys(REACTIONS)) {
    if (!postIds.has(id) && !(id.startsWith('entry-') && !pack.features.sideQuests)) throw new Error(`REACTIONS refers to a post that is not seeded: ${id}`);
  }

  // The pinned entry of a votes pack: the best score (fewer downs, then the earlier post), as the trigger would set it.
  const best = voted.filter((v) => v.score >= 1).sort((a, b) => b.score - a.score || a.down - b.down || a.at - b.at)[0];
  if (best) {
    entries.push(['game/top', { feedId: best.id, score: best.score, up: best.up, down: best.down, since: Stamp.fromMillis(best.last), previousFeedId: null, previousSince: null }]);
  }

  // Map pins around the pack's centre, only for packs with a map.
  if (pack.features.map && pack.map) {
    const { lat, lng } = pack.map.centre;
    for (const bot of BOTS) {
      entries.push([`locations/${bot.uid}`, { lat: lat + bot.offset[0], lng: lng + bot.offset[1], accuracy: 10, updatedAt: at(0) }]);
    }
  }

  // The GM's route, for packs with stops and a route: the first three revealed with times, the rest hidden.
  for (const stop of routeSeedStops(pack)) {
    const timed = DEMO_ROUTE_TIMES[stop.order - 1];
    entries.push([
      `stops/${stop.id}`,
      {
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        order: stop.order,
        address: stop.address,
        placeRef: stop.placeRef,
        placeName: stop.placeName,
        startsAt: timed ? Stamp.fromMillis(nowMs + timed.startsMin * 60_000) : null,
        endsAt: timed?.endsMin === undefined ? null : Stamp.fromMillis(nowMs + timed.endsMin * 60_000),
        revealed: !!timed,
        createdAt: at(240),
      },
    ]);
  }

  return {
    docs: entries.map(([path, data]) => ({ path, data })),
    files,
    players: [...BOTS.map((b) => ({ uid: b.uid, displayName: b.name })), { uid: NEWCOMER.uid, displayName: NEWCOMER.name }],
  };
}
