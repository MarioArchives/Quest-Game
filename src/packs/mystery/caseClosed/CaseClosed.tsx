// Case closed: the mystery pack's wrap (screens.wrap), Natalia's desk. It reads the case file the closing hook wrote
// (game/final.closing), the story's facts, the route and the booking desk's particulars, and lays the night out as
// papers on the desk (Desk.tsx), ending on your profile, or for the GM the night's honours. A game closed before the
// case file existed gets the engine's wrap instead.
import { lazy, Suspense, useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { CaseFile } from '../../../../functions/src/shared/packs/mystery/caseClosed.ts';
import { standingOf } from '../../../../functions/src/shared/standing.ts';
import { Loader } from '../../../components/Loader';
import { useGame } from '../../../data/GameProvider';
import { tsMs, useDocument, useQuery } from '../../../data/hooks';
import { clockTime } from '../../../lib/time';
import { leaveMs, orderStops } from '../../../modules/map/stops';
import { pack, zone } from '../../../pack';
import { useSession } from '../../../session/SessionProvider';
import type { Fact, FinalStandings, Stop } from '../../../shared';
import { caseNumber } from '../dossier';
import { AWARD_COUNT, awardStory, myStory, type AwardContext } from './awards';
import { pointsByStop, stopAt } from './crawl';
import { CrawlPage } from './CrawlPage';
import { Desk, type DeskItem } from './Desk';
import type { MugPerson } from './Mugshot';
import { PaperView, type Edition, type Pose } from './Paper';
import { papers, type PaperEntry } from './papers';
import { PointsPage } from './PointsPage';
import { HonoursSheet, ProfileSheet } from './Profile';
import { capitalise, numberWord, ordinal, placeWord } from './words';
import './desk.css';

const EngineWrap = lazy(() => import('../../../screens/WrapScreen'));

/** Where each edition lands on the desk (x off the middle, top, turn), as the mockup piles them. */
const PAPER_POSES: Pose[] = [
  { x: -10, y: 78, r: -5 },
  { x: 14, y: 330, r: 4 },
  { x: -16, y: 150, r: 6 },
  { x: 12, y: 404, r: -3 },
  { x: -6, y: 214, r: -6 },
  { x: 6, y: 286, r: 2 },
];
const CRAWL_POSE: Pose = { x: -2, y: 60, r: -1.5 };
const POINTS_POSE: Pose = { x: 3, y: 66, r: 1.2 };
const FOLD_POSE: Pose = { x: 0, y: 128, r: 1.5 };

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(zone.locale, { ...opts, timeZone: zone.timeZone });
const DATE = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const DAY = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const DAY_MONTH = fmt({ day: '2-digit', month: '2-digit' });
const time = (ms: number) => clockTime(ms, zone);
/** Points as the paper prints a total: 22, −13. */
const total = (n: number) => (n < 0 ? `−${-n}` : String(n));

function entriesOf(fact: Fact | undefined): PaperEntry[] {
  return (fact?.entries ?? []).map((e) => ({
    uid: e.uid,
    displayName: e.displayName,
    caption: e.caption,
    imagePath: e.imagePath,
    thumbPath: e.thumbPath,
    votes: e.yes ?? e.votes,
  }));
}

export default function CaseClosed() {
  const navigate = useNavigate();
  const { user, isAdmin } = useSession();
  const { state, playersById, myMotive, settings } = useGame();
  const ended = state.status === 'ended';
  const final = useDocument<FinalStandings>(ended ? 'game/final' : null);
  const factDocs = useQuery<Fact>(ended ? { path: 'facts' } : null);
  const stopDocs = useQuery<Stop>(ended ? (isAdmin ? { path: 'stops' } : { path: 'stops', where: [['revealed', '==', true]] }) : null);
  const close = () => navigate('/');

  const desk = useMemo(() => {
    const file = final.data?.closing as CaseFile | undefined;
    if (!final.data || !file?.verdict) return null;
    const standings = final.data.standings;
    const endedAt = tsMs(final.data.endedAt);
    const startedAt = tsMs(state.startedAt) || null;
    const from = startedAt ?? Math.min(endedAt - 5 * 3_600_000, ...file.timeline.map((l) => l.t));
    const night = startedAt ?? endedAt;
    const issue = DAY_MONTH.formatToParts(night).filter((p) => p.type !== 'literal').map((p) => p.value).join('');
    const edition: Edition = { issue, date: (ms) => DATE.format(ms), time };
    const nameOf = (uid: string) => standings.find((s) => s.uid === uid)?.displayName ?? playersById.get(uid)?.displayName ?? 'Someone';
    const person = (uid: string): MugPerson | null => {
      const s = standings.find((x) => x.uid === uid);
      const p = playersById.get(uid);
      if (!s && !p) return null;
      return { name: s?.displayName ?? p?.displayName ?? 'Someone', photo: p?.photoURL ?? s?.photoURL ?? null, heightCm: p?.particulars?.heightCm ?? null, caseNo: caseNumber(uid) };
    };
    const me = user && standings.some((s) => s.uid === user.uid) ? standings.find((s) => s.uid === user.uid)! : null;

    // The route, with when the group was at each bar.
    const route = orderStops(stopDocs.data, isAdmin);
    const timed = route.map((s, i) => ({ ...s, startMs: s.startMs, leaveMs: leaveMs(route, i) }));
    const deathStop = file.deathAt !== null ? stopAt(timed, file.deathAt) : null;
    const lastSeen = file.awards.find((a) => a.id === 'lastseen');
    const facts = new Map(factDocs.data.map((f) => [f.key ?? f.id, f]));
    const death = facts.get('timeOfDeath');

    const editions = papers({
      people: standings.map((s) => ({ uid: s.uid, name: s.displayName, bookedAt: tsMs(playersById.get(s.uid)?.bookedAt) || null })),
      startedAt,
      endedAt,
      firstStop: route[0]?.name ?? null,
      weapon: facts.get('weapon') ? { entries: entriesOf(facts.get('weapon')), at: tsMs(facts.get('weapon')!.at) } : null,
      scene: facts.get('scene') ? { entries: entriesOf(facts.get('scene')), at: tsMs(facts.get('scene')!.at) } : null,
      timeOfDeath: death?.value ? { value: death.value, at: tsMs(death.at) } : null,
      deathStop: deathStop?.name ?? null,
      lastSeen: lastSeen ? { uid: lastSeen.uids[0], at: lastSeen.n[lastSeen.uids[0]]?.at ?? 0 } : null,
      verdict: file.verdict,
      time,
      day: DAY.format(night),
      caseNo: caseNumber,
    });

    const items: DeskItem[] = editions.map((paper, i) => ({
      key: paper.id,
      label: `${paper.kicker}: ${paper.headline}`,
      hold: 3400,
      hint: i === 0 ? 'Tap for the next edition' : undefined,
      render: ({ landing }) => <PaperView paper={paper} pose={PAPER_POSES[i % PAPER_POSES.length]} edition={edition} person={person} landing={landing} />,
    }));

    if (route.length) {
      const mine = me ? pointsByStop(file.timeline, me.uid, timed) : route.map(() => null);
      const kicker = me ? `Your crawl · ${me.displayName}` : 'The crawl';
      const headline = me
        ? `${capitalise(numberWord(route.length))} ${route.length === 1 ? 'bar' : 'bars'}, ${total(me.points)} ${Math.abs(me.points) === 1 ? 'point' : 'points'}`
        : `${capitalise(numberWord(route.length))} ${route.length === 1 ? 'bar' : 'bars'}, one body`;
      items.push({
        key: 'crawl',
        label: `${kicker}: ${headline}`,
        hold: 6500,
        render: ({ landing }) => (
          <CrawlPage
            stops={route.map((s, i) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, points: mine[i] }))}
            kicker={kicker}
            headline={headline}
            death={deathStop && file.deathAt !== null ? { stopId: deathStop.id, time: time(file.deathAt) } : null}
            pose={CRAWL_POSE}
            edition={edition}
            at={endedAt}
            landing={landing}
          />
        ),
      });
    }

    const racers = standings.map((s) => ({ uid: s.uid, name: s.displayName, person: person(s.uid)! }));
    const top = standings.filter((s) => s.rank === 1);
    const pointsKicker = me ? 'Your night in points' : 'The night in points';
    const pointsHeadline = me
      ? `In at ${ordinal(me.rank)}, on ${total(me.points)}`
      : top.length === 1
        ? `${top[0].displayName} takes the title`
        : 'A dead heat at the top';
    items.push({
      key: 'points',
      label: `${pointsKicker}: ${pointsHeadline}`,
      hold: 11_000,
      render: ({ landing, top: onTop }) => (
        <PointsPage
          timeline={file.timeline}
          players={racers}
          me={me?.uid ?? null}
          from={from}
          to={endedAt}
          lines={{ confidantAbove: settings.confidantAbove ?? null, poiBelow: settings.poiBelow ?? null }}
          kicker={pointsKicker}
          headline={pointsHeadline}
          time={time}
          pose={POINTS_POSE}
          edition={edition}
          play={landing && onTop}
          landing={landing}
        />
      ),
    });

    const ctx: AwardContext = {
      name: nameOf,
      timeline: file.timeline,
      verdict: file.verdict,
      time,
      deathAt: file.deathAt,
      lovers: standings.filter((s) => playersById.get(s.uid)?.particulars?.relation === 'lover').map((s) => s.displayName),
    };
    const n = standings.length;
    const charged = file.verdict.uids.length;
    const closing = charged
      ? `Case ${issue} is closed. Police thank all ${numberWord(n)} for their help, ${numberWord(n - charged)} of them sincerely.`
      : `Case ${issue} stays open. Police thank all ${numberWord(n)} for their help.`;

    let sheet;
    let foldLabel;
    if (me) {
      const p = playersById.get(me.uid);
      const relationId = p?.particulars?.relation ?? null;
      const relation = pack.booking?.relations?.find((r) => r.id === relationId)?.phrase ?? null;
      const stories = file.awards.filter((a) => a.uids.includes(me.uid)).map((a) => myStory(a, me.uid, ctx));
      sheet = (
        <ProfileSheet
          data={{
            name: me.displayName,
            person: person(me.uid)!,
            relation,
            relationId,
            bookedAt: tsMs(p?.bookedAt) || null,
            rank: me.rank,
            of: n,
            points: me.points,
            standing: standingOf(me.points, { confidantAbove: settings.confidantAbove ?? null, poiBelow: settings.poiBelow ?? null }),
            stories,
            motive: myMotive?.text ? { text: myMotive.text, by: myMotive.byUid ? nameOf(myMotive.byUid) : null } : null,
          }}
          edition={edition}
          at={endedAt}
          total={AWARD_COUNT}
          place={`${placeWord(me.rank)} of ${numberWord(n)}, ${total(me.points)} ${Math.abs(me.points) === 1 ? 'point' : 'points'}.`}
          closing={closing}
        />
      );
      foldLabel = `Detective profiles: ${me.displayName}`;
    } else {
      sheet = <HonoursSheet stories={file.awards.map((a) => awardStory(a, ctx))} person={person} edition={edition} at={endedAt} closing={closing} />;
      foldLabel = 'The night’s honours';
    }

    return {
      items,
      sheet,
      fold: { label: foldLabel, hint: 'Tap to unfold', pose: FOLD_POSE },
      plate: { title: `Case ${issue} · Bob`, sub: `Closed ${time(endedAt)} · ${numberWord(editions.length)} editions` },
    };
  }, [final.data, factDocs.data, stopDocs.data, state.startedAt, playersById, myMotive, settings, user, isAdmin]);

  if (!ended) {
    return (
      <div className="cc-note">
        <p>The case is still open. Your file lands on the desk when the GM closes it.</p>
        <button type="button" className="btn" onClick={close}>
          Back to the case
        </button>
      </div>
    );
  }
  if (final.loading || factDocs.loading || stopDocs.loading) return <Loader className="cc-loader" caption="Fetching the papers" />;
  if (!desk) {
    // A case closed before the desk: the engine's wrap, with a way out of the bare frame.
    return (
      <div className="cc-fallback">
        <button type="button" className="cc-desk__close" onClick={close} aria-label="Close the case file">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <Suspense fallback={<Loader caption="Loading" />}>
          <EngineWrap />
        </Suspense>
      </div>
    );
  }
  return <Desk items={desk.items} fold={desk.fold} sheet={desk.sheet} plate={desk.plate} onClose={close} />;
}
