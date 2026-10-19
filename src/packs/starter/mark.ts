import type { LoaderMark } from '../types.ts';

// A ticket stub in the same two passes as every pack's mark: a solid accent plate knocked off-register, and the ink
// line drawing in five tiers (outline, perforation, star, the stub's lines). The app's LoaderArt and the boot figure in
// index.html (brand.ts) both draw this; a new pack copies this file and draws its own.
export const mark: LoaderMark = {
  strokeWidth: 2,
  plate: [{ shape: 'rect', attrs: { x: 6, y: 16, width: 52, height: 32 } }],
  tiers: [
    // 1 the ticket outline with its two side notches
    ['M6 16h52v10a4 4 0 0 0 0 8v14H6V34a4 4 0 0 0 0-8z'],
    // 2 the perforation
    ['M42 16v4M42 24v4M42 32v4M42 40v4'],
    // 3 the star
    ['M24 22l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z'],
    // 4 text line on the stub
    ['M47 24h6'],
    // 5 second text line on the stub
    ['M47 30h6M47 36h4'],
  ],
};
