import type { PlayerRecord } from '../../lib/record';

/** Three tear-off stats (quests, side quests, guesses), then how the failed quests failed. */
export function RecordCard({ record, joined, loading }: { record: PlayerRecord; joined: string | null; loading: boolean }) {
  // Everything but "done" comes from the points ledger, so it waits for it.
  const n = (value: number) => (loading ? '–' : value);
  const { failed } = record;
  return (
    <section className="pl-sec" aria-labelledby="pl-rec">
      <div className="pl-sec__head">
        <h3 id="pl-rec" className="pl-sec__title">
          Record
        </h3>
        {joined ? <span className="pl-sec__meta">Joined {joined}</span> : null}
      </div>
      <ul className="pl-stats">
        <Stat label="Quests" main={record.completed} mainLabel="done" sub={n(failed.total)} subLabel="failed" subRed={failed.total > 0} />
        <Stat label="Side quests" main={n(record.sideQuests.won)} mainLabel="won" sub={record.sideQuests.entered} subLabel="entered" />
        <Stat label="Guesses" main={n(record.guesses.right)} mainLabel="right" sub={n(record.guesses.made)} subLabel="made" />
      </ul>
      {!loading && failed.total > 0 ? (
        <ul className="pl-fails" aria-label={`How the ${failed.total} failed`}>
          <li>
            <span className="pl-fails__n">{failed.exposed}</span> exposed by a guess
          </li>
          <li>
            <span className="pl-fails__n">{failed.rejected}</span> claim{failed.rejected === 1 ? '' : 's'} rejected
          </li>
          <li>
            <span className="pl-fails__n">{failed.fraud}</span> overturned as fraud
          </li>
        </ul>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  main,
  mainLabel,
  sub,
  subLabel,
  subRed = false,
}: {
  label: string;
  main: number | string;
  mainLabel: string;
  sub: number | string;
  subLabel: string;
  subRed?: boolean;
}) {
  return (
    <li className="pl-stat">
      <p className="pl-stat__label">{label}</p>
      <div className="pl-perf pl-perf--sm" aria-hidden="true" />
      <p className="pl-stat__main">
        <span className="pl-stat__num">{main}</span> {mainLabel}
      </p>
      <p className={`pl-stat__sub${subRed ? ' is-red' : ''}`}>
        <span className="pl-stat__num2">{sub}</span> {subLabel}
      </p>
    </li>
  );
}
