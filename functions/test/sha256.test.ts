// Data-layer plan edge case 17: the pure SHA-256 gives exactly what node:crypto gives, so push token ids
// (pushTokens/{sha256 of the token}) don't change when the rules stop using node:crypto.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/shared/store/sha256.js';

const node = (text: string) => createHash('sha256').update(text).digest('hex');

describe('sha256Hex', () => {
  it.each([
    ['the empty string', ''],
    ['ASCII', 'abc'],
    ['multi-byte UTF-8', 'héllo wörld 🎉 ✓'],
    ['55 bytes (one block with padding)', 'a'.repeat(55)],
    ['56 bytes (padding spills into a second block)', 'a'.repeat(56)],
    ['exactly 64 bytes', 'b'.repeat(64)],
    ['a long FCM-like token', 'f'.repeat(40) + ':APA91b' + 'Xy_-'.repeat(35)],
  ])('matches node:crypto for %s', (_label, text) => {
    expect(sha256Hex(text)).toBe(node(text));
  });

  it('is lower-case hex, 64 characters', () => {
    expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
