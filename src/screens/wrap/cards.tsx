// The player's own story cards. Each export renders just the body of one card; WrapStory adds the
// poster chrome (eyebrow, footer, progress bars, buttons).
import { useState, type ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { useStorageUrl } from '../../data/hooks';
import type { QuestStatus, Wrap } from '../../shared';
import { PointsLine } from './PointsLine';

// ---- small pieces -------------------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function Tile({ value, label, big = false }: { value: ReactNode; label: string; big?: boolean }) {
  return (
    <div className={`w-tile${big ? ' w-tile--big' : ''}`}>
      <p className="w-tile__n">{value}</p>
      <p className="w-tile__l">{label}</p>
    </div>
  );
}

function CheckMark() {
  return (
    <span className="w-check" aria-label="Done" role="img">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12l5 5L19 7" />
      </svg>
    </span>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
      <path d="M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
    </svg>
  );
}

/**
 * A storage photo. crossOrigin="anonymous" lets "Save image" re-fetch it; if the host sends no CORS
 * headers the browser refuses that request outright, so we retry once as a plain image (it still shows on
 * screen, the PNG gets an empty tile) and finally fall back to the tinted placeholder.
 */
export function StorageImg({ path, fallbackPath, className }: { path: string | null | undefined; fallbackPath?: string | null; className?: string }) {
  const primary = useStorageUrl(path);
  const secondary = useStorageUrl(primary ? null : fallbackPath);
  const url = primary ?? secondary;
  const [mode, setMode] = useState<'cors' | 'plain' | 'failed'>('cors');
  if (!url || mode === 'failed') return <span className={`w-photo__empty ${className ?? ''}`} aria-hidden="true" />;
  return (
    <img
      key={`${url}-${mode}`}
      className={className}
      src={url}
      alt=""
      crossOrigin={mode === 'cors' ? 'anonymous' : undefined}
      draggable={false}
      onError={() => setMode((m) => (m === 'cors' ? 'plain' : 'failed'))}
    />
  );
}

// ---- 1. rank & points ---------------------------------------------------------------------

export function RankCard({ wrap, tiedWith }: { wrap: Wrap; tiedWith: string[] }) {
  const exposed = wrap.exposedBy.length;
  return (
    <>
      <div className="w-who">
        <Avatar name={wrap.displayName} src={wrap.photoURL} size={52} />
        <p className="w-sub">
          <strong>{wrap.displayName}</strong>
          <br />
          Lancaster Music Festival 2026
        </p>
      </div>
      <h2 className="w-title">Your quest night</h2>
      <div className="w-tiles">
        <Tile big value={`#${wrap.rank}`} label={`of ${plural(wrap.playerCount, 'player')}`} />
        <Tile big value={wrap.points} label="points" />
      </div>
      {tiedWith.length > 0 ? (
        <p className="w-sub">
          Level with {tiedWith.length === 1 ? tiedWith[0] : `${tiedWith.slice(0, -1).join(', ')} and ${tiedWith[tiedWith.length - 1]}`}.
        </p>
      ) : null}
      <div className="w-tiles w-tiles--small">
        <Tile value={wrap.completed.length} label="quests done" />
        <Tile value={wrap.sideQuestsWon.length} label={wrap.sideQuestsWon.length === 1 ? 'side quest won' : 'side quests won'} />
        <Tile value={`${wrap.guessStats.hits} of ${wrap.guessStats.made}`} label="guesses hit" />
        <Tile value={`${exposed}×`} label={exposed === 0 ? 'times exposed' : 'exposed'} />
      </div>
    </>
  );
}

// ---- 2. points across the night -----------------------------------------------------------

export function SeriesCard({ wrap }: { wrap: Wrap }) {
  return (
    <>
      <p className="w-kicker">Your points across the night</p>
      <h2 className="w-title">{wrap.points} points</h2>
      <PointsLine series={wrap.pointsSeries} />
    </>
  );
}

// ---- 3. quests completed ------------------------------------------------------------------

const GRID_MAX = 6;

export function CompletedCard({ wrap }: { wrap: Wrap }) {
  const done = wrap.completed;
  // A claim can be approved without a photo (a comment only, or nothing yet): it still counts, it just has no tile.
  const withPhoto = done.filter((c) => c.thumbPath || c.imagePath);
  return (
    <>
      <p className="w-kicker">Quests completed</p>
      <p className="w-mega">{done.length}</p>
      {done.length === 0 ? (
        <p className="w-sub">No approved quests this time. The hand was dealt, the night got in the way.</p>
      ) : (
        <>
          {withPhoto.length > 0 ? (
            <ul className="w-grid" aria-label="Your approved photos">
              {withPhoto.slice(0, GRID_MAX).map((c) => (
                <li key={c.submissionId} className="w-photo">
                  <StorageImg path={c.thumbPath} fallbackPath={c.imagePath} />
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="w-list">
            {done.slice(0, 5).map((c) => (
              <li key={c.submissionId}>{c.title || 'Secret quest'}</li>
            ))}
            {done.length > 5 ? <li className="w-list__more">+{done.length - 5} more</li> : null}
          </ul>
        </>
      )}
    </>
  );
}

// ---- 4. side quests won -------------------------------------------------------------------

export function SideQuestsCard({ wrap }: { wrap: Wrap }) {
  const won = wrap.sideQuestsWon;
  return (
    <>
      <p className="w-kicker">Side quests won</p>
      <p className="w-mega">{won.length}</p>
      {won.length === 0 ? (
        <p className="w-sub">None this time. Somebody else was faster, or the GM liked their photo more.</p>
      ) : (
        <ul className="w-rows">
          {won.map((g) => (
            <li key={g.globalQuestId} className="w-row">
              <span className="w-row__title">{g.title}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---- 5. secret hand revealed --------------------------------------------------------------

const DONE: QuestStatus = 'done';

export function HandCard({ wrap }: { wrap: Wrap }) {
  const hand = wrap.hand;
  const finished = hand.filter((q) => q.status === DONE).length;
  return (
    <>
      <p className="w-kicker">Your secret hand, revealed</p>
      <h2 className="w-title">
        {finished} of {hand.length} finished
      </h2>
      {hand.length === 0 ? (
        <p className="w-sub">No quests were dealt to you.</p>
      ) : (
        <ul className="w-hand">
          {hand.map((q, i) => {
            const open = q.status === 'active' || q.status === 'submitted';
            return (
              <li key={`${q.templateId}-${i}`} className="w-hand__row">
                <div className="w-hand__text">
                  <p className="w-hand__title">{q.title}</p>
                  {open && q.description ? <p className="w-hand__desc">{q.description}</p> : null}
                </div>
                {q.status === 'done' ? (
                  <CheckMark />
                ) : q.status === 'exposed' ? (
                  <span className="w-stamp w-stamp--white">Exposed</span>
                ) : (
                  <span className="w-stamp">Unfinished</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ---- 6. detective stats -------------------------------------------------------------------

export function DetectiveCard({ wrap }: { wrap: Wrap }) {
  const { made, hits, pointsTaken } = wrap.guessStats;
  return (
    <>
      <p className="w-kicker">Detective work</p>
      <p className="w-mega">
        {hits}
        <span className="w-mega__of"> of {made}</span>
      </p>
      <p className="w-sub">{made === 0 ? 'You never took a guess. Everyone slept easy.' : `${plural(hits, 'guess', 'guesses')} hit out of ${plural(made, 'guess', 'guesses')} made.`}</p>
      <div className="w-tiles">
        <Tile value={made} label="guesses made" />
        <Tile value={hits} label="hits" />
      </div>
      <Tile value={pointsTaken > 0 ? `−${pointsTaken}` : '0'} label="points taken from rivals" big />
    </>
  );
}

// ---- 7. exposed by ------------------------------------------------------------------------

export function ExposedCard({ wrap }: { wrap: Wrap }) {
  const list = wrap.exposedBy;
  return (
    <>
      <p className="w-kicker">Exposed by</p>
      <p className="w-mega">{list.length}×</p>
      {list.length === 0 ? (
        <p className="w-sub">Nobody caught you. Your hand stayed secret all night.</p>
      ) : (
        <ul className="w-rows">
          {list.map((e, i) => (
            <li key={`${e.uid}-${i}`} className="w-row">
              <span className="w-row__title">{e.displayName}</span>
              <span className="w-row__note">cracked &ldquo;{e.title}&rdquo;</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---- 8. most-loved photo ------------------------------------------------------------------

export function TopPhotoCard({ wrap }: { wrap: Wrap }) {
  const top = wrap.topPhoto;
  const hasImage = Boolean(top && (top.imagePath || top.thumbPath));
  return (
    <>
      <p className="w-kicker">Most loved</p>
      {top ? (
        <>
          <p className="w-mega">
            {top.reactionCount}
            <span className="w-mega__of"> {top.reactionCount === 1 ? 'reaction' : 'reactions'}</span>
          </p>
          {hasImage ? (
            <div className="w-photo w-photo--wide">
              <StorageImg path={top.imagePath} fallbackPath={top.thumbPath} />
            </div>
          ) : null}
          {top.caption ? <p className={hasImage ? 'w-quote' : 'w-quote w-quote--big'}>&ldquo;{top.caption}&rdquo;</p> : null}
          {top.reactionCount === 0 ? <p className="w-sub">Nobody reacted. Tough crowd.</p> : null}
        </>
      ) : (
        <>
          <p className="w-mega">0</p>
          <p className="w-sub">No approved quests, so nothing for the crowd to cheer.</p>
        </>
      )}
    </>
  );
}

// ---- 9. venues (only shown when there is at least one; WrapScreen leaves the card out otherwise) ----------------------------------------------------------------------------

export function VenuesCard({ wrap }: { wrap: Wrap }) {
  const venues = wrap.venues;
  return (
    <>
      <p className="w-kicker">Venues you posted from</p>
      <p className="w-mega">{venues.length}</p>
      {venues.length === 0 ? (
        <p className="w-sub">No venue check-ins. Switch location sharing on next time and the map remembers.</p>
      ) : (
        <ul className="w-chips">
          {venues.map((v) => (
            <li key={v.id} className="w-chip">
              <PinIcon />
              {v.name}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---- 10. rerolls --------------------------------------------------------------------------

export function RerollsCard({ wrap, limit }: { wrap: Wrap; limit: number }) {
  const used = wrap.rerollsUsed;
  const allowance = wrap.rerollAllowance ?? limit;
  return (
    <>
      <p className="w-kicker">Rerolls used</p>
      <p className="w-mega">
        {used}
        <span className="w-mega__of"> / {allowance}</span>
      </p>
      <p className="w-sub">
        {used === 0
          ? 'Not once. Every quest played exactly as dealt.'
          : used >= allowance
            ? 'Every reroll spent. You wanted a better hand and you went and got one.'
            : `${plural(used, 'quest')} swapped for something you fancied more.`}
      </p>
    </>
  );
}

// ---- 11. award ----------------------------------------------------------------------------

export function AwardCard({ wrap }: { wrap: Wrap }) {
  return (
    <>
      <p className="w-kicker">Your award</p>
      <div className="w-award">
        <p className="w-award__label">The festival gives you</p>
        <h2 className="w-award__title">{wrap.award.title}</h2>
        <p className="w-award__desc">{wrap.award.description}</p>
      </div>
      <p className="w-sub">
        {wrap.displayName}, #{wrap.rank} of {plural(wrap.playerCount, 'player')}, {wrap.points} points.
      </p>
    </>
  );
}

/** Shown ahead of the finale when a player's own wrap has not been written. */
export function MissingWrapCard() {
  return (
    <>
      <p className="w-kicker">Your wrap</p>
      <h2 className="w-title">Not ready</h2>
      <p className="w-sub">Your own story isn&apos;t here yet. Ask the GM to check the game was ended properly. The group finale is next.</p>
    </>
  );
}
