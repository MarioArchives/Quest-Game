import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { useMemo, useState, type FormEvent } from 'react';
import { friendlyError } from '../../api';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { db } from '../../firebase';
import type { Doc, QuestTemplate } from '../../shared';
import { useRunner } from './common';

type TemplateScope = QuestTemplate['scope'];

export function TemplatesSection() {
  const { templatesById, settings } = useGame();
  const { busyKey, run } = useRunner();
  const [scope, setScope] = useState<TemplateScope>('personal');
  const [search, setSearch] = useState('');
  const [showRetired, setShowRetired] = useState(true);
  const [editing, setEditing] = useState<Doc<QuestTemplate> | 'new' | null>(null);

  const all = useMemo(() => [...templatesById.values()], [templatesById]);
  const counts = useMemo(
    () => ({
      personal: all.filter((t) => t.scope === 'personal').length,
      global: all.filter((t) => t.scope === 'global').length,
      retired: all.filter((t) => !t.active).length,
    }),
    [all],
  );
  const needle = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      all
        .filter((t) => t.scope === scope)
        .filter((t) => showRetired || t.active)
        .filter((t) => !needle || t.title.toLowerCase().includes(needle) || (t.description ?? '').toLowerCase().includes(needle))
        .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })),
    [all, scope, showRetired, needle],
  );

  const setActive = (template: Doc<QuestTemplate>, active: boolean) =>
    void run(
      `active:${template.id}`,
      () => updateDoc(doc(db, 'questTemplates', template.id), { active }),
      active ? `“${template.title}” is back in the deck.` : `“${template.title}” retired.`,
    );

  return (
    <>
      <div className="section-head">
        <h2>Quest templates</h2>
        <span className="section-head__meta">
          {counts.personal} personal · {counts.global} side · {counts.retired} retired
        </span>
      </div>

      <div className="gm-seg" role="group" aria-label="Which quests">
        <button type="button" className="gm-seg__btn" aria-pressed={scope === 'personal'} onClick={() => setScope('personal')}>
          Personal ({counts.personal})
        </button>
        <button type="button" className="gm-seg__btn" aria-pressed={scope === 'global'} onClick={() => setScope('global')}>
          Side quests ({counts.global})
        </button>
      </div>

      <div className="gm-toolbar">
        <div className="field gm-toolbar__search">
          <label className="visually-hidden" htmlFor="tpl-search">
            Search quests
          </label>
          <input id="tpl-search" className="input" type="search" placeholder="Search" value={search} autoComplete="off" onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="primary" className="gm-toolbar__add" icon={<Icon name="plus" size={20} strokeWidth={2.4} />} onClick={() => setEditing('new')}>
          New
        </Button>
      </div>
      <label className="gm-check">
        <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
        <span>Show retired</span>
      </label>

      {shown.length === 0 ? (
        <div className="empty">
          <h3>{needle ? 'No match' : 'Nothing here'}</h3>
          <p>{needle ? `No quest matches “${search.trim()}”.` : 'Add one with New.'}</p>
        </div>
      ) : (
        <ul className="gm-list">
          {shown.map((t) => {
            return (
              <li key={t.id} className={`gm-tpl${t.active ? '' : ' is-retired'}`}>
                <div className="gm-tpl__text">
                  <p className="gm-tpl__title">{t.title}</p>
                  {t.description ? <p className="gm-tpl__desc">{t.description}</p> : null}
                  <p className="gm-tpl__tags">
                    {t.active ? null : <span className="tag tag--red">Retired</span>}
                    {t.scope === 'global' ? <span className="tag">{t.windowMin ?? settings.globalWindowMin} min</span> : null}
                  </p>
                </div>
                <div className="gm-tpl__actions">
                  <Button small onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                  <Button small busy={busyKey === `active:${t.id}`} disabled={busyKey !== null} onClick={() => setActive(t, !t.active)}>
                    {t.active ? 'Retire' : 'Restore'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? <TemplateSheet template={editing === 'new' ? null : editing} defaultScope={scope} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function TemplateSheet({ template, defaultScope, onClose }: { template: Doc<QuestTemplate> | null; defaultScope: TemplateScope; onClose(): void }) {
  const toast = useToast();
  const { settings } = useGame();

  const [title, setTitle] = useState(template?.title ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [scope, setScope] = useState<TemplateScope>(template?.scope ?? defaultScope);
  const [windowMin, setWindowMin] = useState(template?.windowMin != null ? String(template.windowMin) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGlobal = scope === 'global';
  const problem = (() => {
    if (!title.trim()) return 'Give it a title.';
    if (title.trim().length > 80) return 'The title can be 80 characters at most.';
    if (!description.trim()) return 'Say what proof is wanted.';
    if (isGlobal && windowMin.trim() && (!/^\d+$/.test(windowMin.trim()) || Number(windowMin) < 5 || Number(windowMin) > 180)) {
      return 'The window is 5 to 180 minutes (or leave it empty for the default).';
    }
    return null;
  })();

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const data = {
      title: title.trim(),
      description: description.trim(),
      scope,
      windowMin: isGlobal && windowMin.trim() ? Number(windowMin) : null,
    };
    try {
      if (template) await updateDoc(doc(db, 'questTemplates', template.id), data);
      else await addDoc(collection(db, 'questTemplates'), { ...data, active: true });
      toast(template ? 'Saved.' : 'Added to the deck.', 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <BottomSheet title={template ? 'Edit quest' : 'New quest'} subtitle={template ? undefined : 'Goes straight into the deck'} onClose={onClose} locked={busy}>
      <form className="gm-form" onSubmit={(event) => void save(event)} noValidate>
        <fieldset className="gm-choice gm-choice--row" disabled={busy || template !== null}>
          <legend className="field__label">Kind{template ? ' (fixed)' : ''}</legend>
          <label className={`gm-choice__opt${scope === 'personal' ? ' is-selected' : ''}`}>
            <input type="radio" name="scope" value="personal" className="visually-hidden" checked={scope === 'personal'} onChange={() => setScope('personal')} />
            <strong>Personal</strong>
          </label>
          <label className={`gm-choice__opt${scope === 'global' ? ' is-selected' : ''}`}>
            <input type="radio" name="scope" value="global" className="visually-hidden" checked={scope === 'global'} onChange={() => setScope('global')} />
            <strong>Side quest</strong>
          </label>
        </fieldset>
        <div className="field">
          <label className="field__label" htmlFor="tpl-title">
            Title
          </label>
          <input id="tpl-title" className="input" value={title} maxLength={80} disabled={busy} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="tpl-desc">
            {isGlobal ? 'What to do or photograph' : 'What proof is wanted'}
          </label>
          <textarea id="tpl-desc" className="textarea" value={description} maxLength={500} disabled={busy} onChange={(e) => setDescription(e.target.value)} />
          {isGlobal ? null : <span className="field__hint">Keep it discreet: rivals guess it by watching.</span>}
        </div>
        {isGlobal ? (
          <>
            <div className="field">
              <label className="field__label" htmlFor="tpl-window">
                Open for (minutes)
              </label>
              <input id="tpl-window" className="input" inputMode="numeric" value={windowMin} placeholder={`Default: ${settings.globalWindowMin}`} disabled={busy} onChange={(e) => setWindowMin(e.target.value)} />
            </div>
          </>
        ) : null}
        {error ? (
          <p className="note note--error" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" block busy={busy}>
          {template ? 'Save changes' : 'Add quest'}
        </Button>
        <Button block variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </form>
    </BottomSheet>
  );
}
