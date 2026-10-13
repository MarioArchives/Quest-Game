import type { SideQuestDraft } from '../../lib/sideQuestDraft';

/** Title, description, window and points: the GM's side-quest form, for a custom one or an edited draw. */
export function SideQuestFields({ draft, onChange, busy, idPrefix = 'sq' }: { draft: SideQuestDraft; onChange(next: SideQuestDraft): void; busy: boolean; idPrefix?: string }) {
  const set = (key: keyof SideQuestDraft) => (event: { target: { value: string } }) => onChange({ ...draft, [key]: event.target.value });
  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor={`${idPrefix}-title`}>
          Title
        </label>
        <input id={`${idPrefix}-title`} className="input" value={draft.title} maxLength={80} disabled={busy} placeholder="Best crowd shot" onChange={set('title')} />
        <span className="field__hint">{80 - draft.title.length} characters left</span>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${idPrefix}-desc`}>
          What to do or photograph
        </label>
        <textarea id={`${idPrefix}-desc`} className="textarea" value={draft.description} maxLength={500} disabled={busy} placeholder="The more specific, the fewer arguments." onChange={set('description')} />
      </div>
      <div className="gm-grid2">
        <div className="field">
          <label className="field__label" htmlFor={`${idPrefix}-window`}>
            Open for (minutes)
          </label>
          <input id={`${idPrefix}-window`} className="input" inputMode="numeric" value={draft.windowMin} disabled={busy} onChange={set('windowMin')} />
          <span className="field__hint">5 to 180, then you check entries and everyone votes</span>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${idPrefix}-points`}>
            Winner gets
          </label>
          <input id={`${idPrefix}-points`} className="input" inputMode="numeric" value={draft.points} disabled={busy} onChange={set('points')} />
          <span className="field__hint">points, tied winners all get it</span>
        </div>
      </div>
    </>
  );
}
