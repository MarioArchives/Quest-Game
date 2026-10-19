// Video entries (a story mission with entry.media 'video'): what the app accepts before it uploads the file as it is.

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 60;
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

/** Null when the video can be sent, else what is wrong with it, in words a player can act on. */
export function checkVideo(video: { type: string; size: number; durationSec: number }): string | null {
  if (!(VIDEO_TYPES as readonly string[]).includes(video.type)) return 'That is not a video the game can play. Use an MP4, MOV or WebM video.';
  if (video.size >= VIDEO_MAX_BYTES) return 'That video is too big. It can be up to 50 MB.';
  if (!Number.isFinite(video.durationSec)) return 'Could not read that video’s length. Try recording it again.';
  if (video.durationSec > VIDEO_MAX_SECONDS) return `That video is too long. It can be up to ${VIDEO_MAX_SECONDS} seconds.`;
  return null;
}
