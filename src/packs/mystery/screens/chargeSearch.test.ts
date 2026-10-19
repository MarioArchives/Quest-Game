import { describe, expect, it } from 'vitest';
import { editDistance, highlight, indexCharges, queryWords, searchCharges, wordsLike, wordsOf } from './chargeSearch';

// A few missions from the book, as they're written.
const book = indexCharges([
  { id: 'p-treat-me', title: 'Treat me', description: 'Get a player to buy you a drink or a snack without asking them directly. Proof: what you got, and who paid.' },
  { id: 'p-hold-this', title: 'Hold this', description: 'Get someone to hold your drink for at least five minutes. Proof: a photo of them holding it.' },
  { id: 'p-cheers', title: 'Cheers!', description: 'Clink drinks with five different strangers (any drink counts). Proof: a photo of the fifth, or a player who counted.' },
  { id: 'p-hand-in-hand', title: 'Hand in hand', description: 'Hold hands with a player for a whole song without explaining why. Proof: the player, and a photo if you can get one.' },
  { id: 'p-pirate-voice', title: 'Pirate voice', description: 'Hold a whole conversation with a stranger in your best pirate voice without breaking character. Proof: a player who heard it.' },
  { id: 'p-dance-partner', title: 'Shall we dance?', description: 'Get a stranger to dance with you for a whole song (with their OK). Proof: a photo, or a player who saw it.' },
  { id: 'p-nice-moves', title: 'Nice moves', description: 'Get a stranger to compliment your dancing. Proof: what they said, and a player who saw it.' },
  { id: 'p-youre-right', title: "You're right", description: 'Get a player to say "you\'re right" to you three times in one night. Proof: the player.' },
  { id: 'p-high-five-run', title: 'High five run', description: 'High five ten different people in under five minutes. Proof: a player who counted.' },
  { id: 'p-cafe', title: 'Café crème', description: 'Order a crème brûlée.' },
]);
const titles = (query: string) => searchCharges(book, query).map((c) => c.title);

describe('wordsOf', () => {
  it('lower-cases, drops apostrophes and accents, and splits on everything else', () => {
    expect(wordsOf('You’re RIGHT, aren\'t you? Café 2p')).toEqual(['youre', 'right', 'arent', 'you', 'cafe', '2p']);
  });
  it('keeps each typed word once', () => {
    expect(queryWords('  drink  DRINK hold ')).toEqual(['drink', 'hold']);
  });
});

describe('searchCharges', () => {
  it('is the whole book A–Z for an empty line', () => {
    expect(titles('')).toEqual([
      'Café crème', 'Cheers!', 'Hand in hand', 'High five run', 'Hold this', 'Nice moves', 'Pirate voice', 'Shall we dance?', 'Treat me', "You're right",
    ]);
    expect(titles('  ')).toHaveLength(10);
  });
  it('finds any word of the title or text, by its start, title matches first', () => {
    expect(titles('drink')).toEqual(['Cheers!', 'Hold this', 'Treat me']);
    expect(titles('hold')).toEqual(['Hold this', 'Hand in hand', 'Pirate voice']);
    expect(titles('dri')).toEqual(['Cheers!', 'Hold this', 'Treat me']);
  });
  it('matches the start of a word only', () => {
    expect(titles('rink')).toEqual([]);
    expect(titles('ance')).toEqual([]);
  });
  it('needs every typed word, in any order', () => {
    expect(titles('five drink')).toEqual(['Cheers!', 'Hold this']);
    expect(titles('drink five minutes')).toEqual(['Hold this']);
  });
  it('ignores case, accents and apostrophes', () => {
    expect(titles('YOURE')).toEqual(["You're right"]);
    expect(titles('creme brulee')).toEqual(['Café crème']);
  });
  it('looks in the proof line too', () => {
    expect(titles('paid')).toEqual(['Treat me']);
  });
});

describe('wordsLike', () => {
  it('offers words from what it found that lead to other missions, title words first, with their counts', () => {
    // "pint" never says Hold this; "drink" does, and "hold" leads on to the other hold missions.
    expect(wordsLike(book, 'drink')[0]).toEqual({ word: 'hold', count: 3 });
  });
  it('only offers words that find something the line has not already found', () => {
    for (const like of wordsLike(book, 'drink', 10)) {
      const found = searchCharges(book, like.word).map((c) => c.id);
      expect(found.some((id) => !titles('drink').includes(book.charges.find((c) => c.id === id)!.title))).toBe(true);
      expect(like.count).toBe(found.length);
    }
  });
  it('never offers what was typed, its endings, the glue of a sentence or the proof line', () => {
    const words = wordsLike(book, 'drink', 20).map((l) => l.word);
    expect(words).not.toContain('drink');
    expect(words).not.toContain('drinks');
    for (const glue of ['your', 'for', 'get', 'five', 'without', 'the']) expect(words).not.toContain(glue);
    // From "Proof: ... who counted" only.
    expect(words).not.toContain('photo');
  });
  it('offers other endings of the word first', () => {
    expect(wordsLike(book, 'dance')[0]).toEqual({ word: 'dancing', count: 1 });
    expect(wordsLike(book, 'dancing')[0]).toEqual({ word: 'dance', count: 1 });
  });
  it('offers a near spelling when the word finds nothing', () => {
    expect(wordsLike(book, 'drnk')).toEqual([{ word: 'drink', count: 3 }]);
    expect(wordsLike(book, 'dirnk')[0]?.word).toBe('drink');
    // A real word that finds something gets no typo suggestions.
    expect(wordsLike(book, 'hold').map((l) => l.word)).not.toContain('hole');
  });
  it('is empty for an empty line, a word still being started, or nothing near', () => {
    expect(wordsLike(book, '')).toEqual([]);
    expect(wordsLike(book, 'dr')).toEqual([]);
    expect(wordsLike(book, 'xylophone')).toEqual([]);
  });
  it('stops at the limit', () => {
    expect(wordsLike(book, 'stranger', 2).length).toBeLessThanOrEqual(2);
  });
});

describe('editDistance', () => {
  it('counts edits, a swap of neighbours as one', () => {
    expect(editDistance('drink', 'drink')).toBe(0);
    expect(editDistance('drnk', 'drink')).toBe(1);
    expect(editDistance('dirnk', 'drink')).toBe(1);
    expect(editDistance('pint', 'print')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('highlight', () => {
  const marked = (text: string, query: string) =>
    highlight(text, query)
      .map((p) => (p.hit ? `[${p.text}]` : p.text))
      .join('');
  it('marks the typed part wherever it starts a word', () => {
    expect(marked('Clink drinks with five different strangers (any drink counts).', 'drink')).toBe(
      'Clink [drink]s with five different strangers (any [drink] counts).',
    );
  });
  it('marks every typed word, any case, across apostrophes and accents', () => {
    expect(marked('Hold hands for a whole song', 'HOLD song')).toBe('[Hold] hands for a whole [song]');
    expect(marked('Say "you\'re right"', 'youre')).toBe('Say "[you\'re] right"');
    expect(marked('Café crème', 'creme')).toBe('Café [crème]');
  });
  it('does not mark inside a word', () => {
    expect(marked('Brink of a drink', 'rink')).toBe('Brink of a drink');
  });
  it('is the text unmarked for an empty line, and nothing for no text', () => {
    expect(highlight('Hold this', ' ')).toEqual([{ text: 'Hold this', hit: false }]);
    expect(highlight('', 'drink')).toEqual([]);
  });
  it('takes regex characters as plain text', () => {
    expect(highlight('a (b) c', '(b')).toEqual([
      { text: 'a (', hit: false },
      { text: 'b', hit: true },
      { text: ') c', hit: false },
    ]);
  });
});
