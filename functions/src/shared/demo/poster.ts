// Placeholder "photos" for the demo: poster-style SVGs, so the demo needs no real images.

const ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
const xmlEscape = (s: string): string => s.replace(/[<>&"']/g, (c) => ESCAPES[c]);

/** Greedy word wrap into at most `maxLines` lines of `maxChars`. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '...';
  }
  return lines;
}

/** Poster style placeholder photo: paper, ink and one red. 4:3 so it behaves like a real photo. */
export function posterSvg(o: { title: string; who: string; width: number; height: number; name: string }): string {
  const { title, who, width, height, name } = o;
  const k = width / 1200;
  const r = (v: number): number => Math.round(v * 10) / 10;
  const lines = wrap(title.toUpperCase(), 14, 3);
  // Conservative glyph width (0.72em, bold caps) so the fallback fonts still fit when Anton is not installed.
  const longest = Math.max(...lines.map((l) => l.length));
  const fontSize = Math.min(150 * k, (1020 * k) / (longest * 0.72));
  const titleLines = lines
    .map((l, i) => `<text x="${r(90 * k)}" y="${r(300 * k + i * fontSize * 1.02)}" font-size="${r(fontSize)}">${xmlEscape(l)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#F4F2EE"/>
<rect x="${r(24 * k)}" y="${r(24 * k)}" width="${r(width - 48 * k)}" height="${r(height - 48 * k)}" fill="none" stroke="#111" stroke-width="${r(6 * k)}"/>
<circle cx="${r(width - 230 * k)}" cy="${r(height - 250 * k)}" r="${r(170 * k)}" fill="#E1251B"/>
<rect x="${r(70 * k)}" y="${r(70 * k)}" width="${r(390 * k)}" height="${r(56 * k)}" fill="#E1251B"/>
<g font-family="Anton, Impact, 'Arial Narrow Bold', 'Arial Black', sans-serif" font-weight="700" fill="#111">
<text x="${r(90 * k)}" y="${r(112 * k)}" font-size="${r(34 * k)}" fill="#fff" letter-spacing="${r(3 * k)}">${xmlEscape(name.toUpperCase())}</text>
${titleLines}
<text x="${r(90 * k)}" y="${r(height - 130 * k)}" font-size="${r(54 * k)}" fill="#E1251B">${xmlEscape(who.toUpperCase())}</text>
</g>
<text x="${r(90 * k)}" y="${r(height - 70 * k)}" font-family="Archivo, Arial, sans-serif" font-size="${r(26 * k)}" font-weight="700" fill="#111" letter-spacing="${r(2 * k)}">DEMO PHOTO · ${xmlEscape(name.toUpperCase())}</text>
</svg>
`;
}
