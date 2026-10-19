import type { DocRef } from '../shared/store/types.js';
import { termForms } from '../shared/packs/terms.js';
import type { GlobalQuest, Submission } from '../shared/types.js';
import type { Ctx, Db } from './context.js';
import { fail, loadState, requireUid } from './guards.js';
import { asId, toTs } from './util.js';

export const CAPTION_MAX = 280;

export interface Evidence {
  imagePath?: string;
  thumbPath?: string;
  /** A video entry's file (its thumbPath is the poster frame, if any). */
  videoPath?: string;
  caption?: string;
}

/** What a story mission asks of an entry (see StoryEntry); anything else takes a photo and/or a caption. */
export interface EvidenceRules {
  media?: 'photo' | 'video' | 'text';
  captionRequired?: boolean;
}

const isOwnPhotoPath = (uid: string, path: unknown): path is string => {
  if (typeof path !== 'string' || path.length > 300) return false;
  const prefix = `submissions/${uid}/`;
  const file = path.slice(prefix.length);
  return path.startsWith(prefix) && file.length > 0 && !file.includes('/');
};

/**
 * Validates client-supplied evidence: a photo (image + thumbnail together, both in the owner's
 * folder) and/or a caption of 1 to 280 characters. At least one is required. A mission's `rules` can ask for more:
 * 'video' needs a video in the owner's folder (a poster thumbnail may come alone), 'text' needs a caption, and
 * `captionRequired` refuses a photo on its own. Only a video mission takes a video.
 */
export function parseEvidence(
  uid: string,
  data: { imagePath?: unknown; thumbPath?: unknown; videoPath?: unknown; caption?: unknown },
  rules: EvidenceRules = {},
): Evidence {
  const out: Evidence = {};
  const hasImage = data.imagePath !== undefined && data.imagePath !== null;
  const hasThumb = data.thumbPath !== undefined && data.thumbPath !== null;
  const hasVideo = data.videoPath !== undefined && data.videoPath !== null;
  const video = rules.media === 'video';
  if (hasVideo && !video) fail('invalid-argument', 'This does not take a video.');
  if (video) {
    if (!hasVideo || !isOwnPhotoPath(uid, data.videoPath)) fail('invalid-argument', 'Upload a video to your own folder.');
    out.videoPath = data.videoPath as string;
    if (hasImage) fail('invalid-argument', 'Send a video, not a photo.');
    if (hasThumb) {
      if (!isOwnPhotoPath(uid, data.thumbPath)) fail('invalid-argument', 'Photos must be uploaded to your own folder.');
      out.thumbPath = data.thumbPath as string;
    }
  } else if (hasImage !== hasThumb) fail('invalid-argument', 'Send the photo and its thumbnail together.');
  if (hasImage) {
    if (!isOwnPhotoPath(uid, data.imagePath) || !isOwnPhotoPath(uid, data.thumbPath)) {
      fail('invalid-argument', 'Photos must be uploaded to your own folder.');
    }
    out.imagePath = data.imagePath;
    out.thumbPath = data.thumbPath as string;
  }
  if (data.caption !== undefined && data.caption !== null) {
    const caption = typeof data.caption === 'string' ? data.caption.trim() : '';
    if (caption.length < 1 || caption.length > CAPTION_MAX) {
      fail('invalid-argument', `The caption must be 1 to ${CAPTION_MAX} characters.`);
    }
    out.caption = caption;
  }
  if (!hasImage && !video && out.caption === undefined) fail('invalid-argument', 'Add a photo or a caption.');
  if (rules.media === 'text' && out.caption === undefined) fail('invalid-argument', 'Write something: this takes a caption.');
  if (rules.captionRequired && out.caption === undefined) fail('invalid-argument', 'Add a caption.');
  return out;
}

/**
 * After a claim is approved, its owner adds evidence — a photo (imagePath + thumbPath under
 * submissions/{uid}/) and/or a caption (≤ 280) — to the submission and its feed post. Can be replaced.
 * Whatever is sent replaces that part of the evidence; parts that are not sent stay as they were.
 */
export async function addEvidence(
  db: Db,
  ctx: Ctx,
  data: { submissionId?: unknown; imagePath?: unknown; thumbPath?: unknown; caption?: unknown },
): Promise<{ ok: true }> {
  const uid = requireUid(ctx);
  const t = termForms(ctx.pack.terms);
  const id = asId(data.submissionId, 'submissionId');
  const evidence = parseEvidence(uid, data);

  return db.runTransaction(async (tx) => {
    const subRef = db.doc(`submissions/${id}`);
    const snap = await tx.get(subRef);
    if (!snap.exists) fail('not-found', 'No such submission.');
    const sub = snap.data() as Submission;
    if (sub.uid !== uid) fail('permission-denied', 'Only the owner can add evidence.');
    // A sealed side-quest entry is still the owner's to change; a claim waits for its approval.
    if (sub.status !== 'approved' && sub.status !== 'sealed') {
      fail('failed-precondition', `Evidence can be added once the ${t.claim.one} is approved.`);
    }
    const state = await loadState(db, tx);
    if (state.status === 'ended') fail('failed-precondition', 'The game has ended.');
    if (sub.kind === 'global') {
      const gq = (await tx.get(db.doc(`globalQuests/${sub.questId}`))).data() as GlobalQuest | undefined;
      if (gq?.status !== 'live') fail('failed-precondition', `Entries can only change while the ${t.sideQuest.one} is live.`);
    }

    // The post announcing the approval: by the stored id, or else the approved post about this submission.
    // A sealed entry's post stays bare until the vote opens and reveals the latest evidence.
    let postRef: DocRef | null = null;
    if (sub.status !== 'sealed') {
      if (sub.feedId) {
        const ref = db.doc(`feed/${sub.feedId}`);
        if ((await tx.get(ref)).exists) postRef = ref;
      }
      if (!postRef) {
        const found = await tx.get(db.collection('feed').where('submissionId', '==', id));
        postRef = found.docs.find((d) => d.get('type') === 'approved')?.ref ?? null;
      }
    }

    tx.update(subRef, { ...evidence, evidenceAt: toTs(ctx.now) });
    if (postRef) tx.update(postRef, evidence);
    return { ok: true as const };
  });
}
