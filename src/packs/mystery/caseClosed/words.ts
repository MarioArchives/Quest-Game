// Small word helpers the Evening Post prints with: numbers as words, lists with "and", plurals. Pure.

const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** A number as the paper writes it: words up to twelve, digits after. */
export function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < SMALL.length ? SMALL[n] : String(n);
}

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Maya", "Maya and Theo", "Maya, Theo and Sam". */
export function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "1 vote", "3 votes"; `word` spells the number ("one vote"). */
export function plural(n: number, one: string, many = `${one}s`, word = false): string {
  return `${word ? numberWord(n) : n} ${n === 1 ? one : many}`;
}

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number): string {
  const teen = n % 100 > 10 && n % 100 < 14;
  return `${n}${teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
}

const PLACES = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

/** "Third", or "11th" past ten. */
export function placeWord(n: number): string {
  return PLACES[n - 1] ?? ordinal(n);
}

/** A possessive: "Maya’s", "James’s". */
export function possessive(name: string): string {
  return `${name}’s`;
}
