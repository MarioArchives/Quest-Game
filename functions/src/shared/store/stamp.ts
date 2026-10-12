// The engine's own timestamp. Stores turn their native times into Stamps on the way out and back on the way in,
// so game code and the app never see a database's Timestamp class.

export class Stamp {
  private readonly ms: number;

  // No parameter property: Node runs this file directly (type stripping), which doesn't support them.
  private constructor(ms: number) {
    this.ms = ms;
  }

  static fromDate(date: Date): Stamp {
    return new Stamp(date.getTime());
  }

  static fromMillis(ms: number): Stamp {
    return new Stamp(ms);
  }

  toMillis(): number {
    return this.ms;
  }

  toDate(): Date {
    return new Date(this.ms);
  }

  isEqual(other: Stamp): boolean {
    return other instanceof Stamp && other.ms === this.ms;
  }
}
