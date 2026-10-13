// "Fire random", with a look first: the GM sees the drawn side quest, can reshuffle or edit it, and only then
// sends it out. The draw is the server's own (`drawTemplate`: unused templates first), and nobody else sees it
// until it is sent.
import { useEffect, useMemo, useState } from 'react';
import { fireGlobalQuest, friendlyError } from '../../api';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Loader } from '../../components/Loader';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { useQuery } from '../../data/hooks';
import { changedFields, sideQuestProblem, type SideQuestDraft } from '../../lib/sideQuestDraft';
import { t } from '../../pack';
import { drawTemplate, type GlobalQuest } from '../../shared';
import { SideQuestFields } from './SideQuestFields';

export function DrawSheet({ liveTitle, onClose, onWrite }: { liveTitle: string | null; onClose(): void; onWrite?(): void }) {
  const { templatesById, settings } = useGame();
  const toast = useToast();
  // Every side quest so far (the GM can read them all), to know which templates have been used.
  const history = useQuery<GlobalQuest>({ path: 'globalQuests' });
  const templates = useMemo(() => [...templatesById.values()].filter((tpl) => tpl.scope === 'global' && tpl.active), [templatesById]);
  const used = useMemo(() => new Set(history.data.map((q) => q.templateId)), [history.data]);

  // Ids offered so far in this draw, oldest first; the last one is on screen.
  const [shown, setShown] = useState<string[]>([]);
  // The GM's edits; null while they haven't opened the form.
  const [draft, setDraft] = useState<SideQuestDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = templates.find((tpl) => tpl.id === shown[shown.length - 1]);
  const ready = !history.loading;

  const reshuffle = () => {
    setShown((seen) => {
      const next = drawTemplate(templates, used, Math.random, seen);
      return next ? [...seen, next.id] : seen;
    });
    setDraft(null);
    setError(null);
  };

  // The first draw, once we know what has been used, and a fresh one if the template on screen is retired meanwhile.
  useEffect(() => {
    if (ready && !current && templates.length > 0 && !busy) reshuffle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, current, templates.length]);

  const base: SideQuestDraft | null = current
    ? {
        title: current.title,
        description: current.description,
        windowMin: String(current.windowMin ?? settings.globalWindowMin),
        points: String(settings.sideQuestPoints),
      }
    : null;

  const send = async () => {
    if (!current || !base) return;
    const problem = draft ? sideQuestProblem(draft) : null;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fireGlobalQuest({ mode: 'template', templateId: current.id, ...(draft ? changedFields(draft, base) : {}) });
      toast(`${t.sideQuest.One} sent out.`, 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  const unused = templates.filter((tpl) => !used.has(tpl.id)).length;
  const edited = draft !== null && base !== null && Object.keys(changedFields(draft, base)).length > 0;

  return (
    <BottomSheet title={`Random ${t.sideQuest.one}`} subtitle="Only you can see it until you send it out" onClose={onClose} locked={busy}>
      {!ready ? (
        <Loader size={48} />
      ) : templates.length === 0 ? (
        <div className="gm-form">
          <p className="gm-intro">There are no active {t.sideQuest.one} templates to draw from.</p>
          {onWrite ? (
            <Button variant="primary" block onClick={onWrite}>
              Write your own
            </Button>
          ) : null}
          <Button block variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      ) : current && base ? (
        <div className="gm-form">
          {draft ? (
            <SideQuestFields draft={draft} onChange={setDraft} busy={busy} idPrefix="draw" />
          ) : (
            <article className="gm-draw" aria-live="polite">
              <p className="gm-draw__meta">
                {used.has(current.id) ? 'Used before' : 'Not used yet'} · {unused} of {templates.length} unused
              </p>
              <h3 className="gm-draw__title">{current.title}</h3>
              {current.description ? <p className="gm-draw__desc">{current.description}</p> : null}
              <p className="gm-draw__facts">
                Open {base.windowMin} min · winner gets {base.points}
              </p>
            </article>
          )}
          <div className="gm-row">
            <Button className="gm-flex1" disabled={busy} icon={<Icon name="refresh" size={18} />} onClick={reshuffle}>
              Reshuffle
            </Button>
            {draft ? (
              <Button className="gm-flex1" disabled={busy} onClick={() => setDraft(null)}>
                Undo edits
              </Button>
            ) : (
              <Button className="gm-flex1" disabled={busy} icon={<Icon name="edit" size={18} />} onClick={() => setDraft(base)}>
                Edit
              </Button>
            )}
          </div>
          {liveTitle ? <p className="gm-hint gm-hint--warn">Sending it moves &ldquo;{liveTitle}&rdquo; on to checking. Only one takes entries at a time.</p> : null}
          {error ? (
            <p className="note note--error" role="alert">
              {error}
            </p>
          ) : null}
          <Button variant="primary" block busy={busy} icon={<Icon name="megaphone" size={20} />} onClick={() => void send()}>
            {edited ? 'Send it out, edited' : 'Send it out'}
          </Button>
          <Button block variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      ) : (
        <Loader size={48} />
      )}
    </BottomSheet>
  );
}
