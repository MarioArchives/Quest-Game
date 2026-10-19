// Video entries (plan "Mystery pack: minimal notifications, Bob's story arc…", edge case 29): what the app accepts
// before it uploads a video as it is.
import { describe, expect, it } from 'vitest';
import { checkVideo, VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS } from './video';

const MiB = 1024 * 1024;

describe('checkVideo', () => {
  it('takes mp4, mov and webm up to 50 MiB and 60 seconds', () => {
    expect(VIDEO_MAX_BYTES).toBe(50 * MiB);
    expect(VIDEO_MAX_SECONDS).toBe(60);
    expect(checkVideo({ type: 'video/mp4', size: 12 * MiB, durationSec: 25 })).toBeNull();
    expect(checkVideo({ type: 'video/quicktime', size: 50 * MiB - 1, durationSec: 60 })).toBeNull();
    expect(checkVideo({ type: 'video/webm', size: 1000, durationSec: 0.5 })).toBeNull();
  });

  it('refuses a longer video, saying how long it may be', () => {
    expect(checkVideo({ type: 'video/mp4', size: MiB, durationSec: 61 })).toMatch(/60 seconds/);
  });

  it('refuses a bigger file, saying how big it may be', () => {
    expect(checkVideo({ type: 'video/mp4', size: 50 * MiB, durationSec: 20 })).toMatch(/50 MB/);
  });

  it('refuses another kind of file', () => {
    expect(checkVideo({ type: 'video/x-msvideo', size: MiB, durationSec: 20 })).toMatch(/mp4|MP4|video/);
    expect(checkVideo({ type: 'image/jpeg', size: MiB, durationSec: 0 })).not.toBeNull();
  });

  it('refuses a video whose length is unknown (it could not be read)', () => {
    expect(checkVideo({ type: 'video/mp4', size: MiB, durationSec: Number.NaN })).not.toBeNull();
  });
});
